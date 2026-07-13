/**
 * GithubService — reads the linked GitHub account (via the token captured during
 * onboarding) to list the user's repositories and clone one into FlowState.
 *
 * Listing hits the GitHub REST API directly with the stored token so it does not
 * depend on the `gh` CLI being installed at call time. Cloning shells out to
 * `git` with the token embedded in the HTTPS URL, then rewrites the `origin`
 * remote back to the clean URL so the token never lands in `.git/config`.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import type { AddProjectInput, CreatePrResult, GithubRepo, PrStatus } from '@flowstate/shared';
import { PrChecks, PrState } from '@flowstate/shared';
import { SecretName } from '../lib/enums/secret';
import { getSecret } from '../store/secrets';
import { authService } from './auth';

///////////////
// Constants //
///////////////

/** Where cloned projects live: `~/FlowState/projects/<repo>`. */
const PROJECTS_DIR = join(homedir(), 'FlowState', 'projects');
const GITHUB_API = 'https://api.github.com';

/////////////
// Helpers //
/////////////

const execFileAsync = promisify(execFile);

/** Run a `git` subcommand, surfacing stderr on failure. */
async function git(args: string[]): Promise<void> {
  try {
    await execFileAsync('git', args, { env: process.env, timeout: 10 * 60 * 1000 });
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(e.stderr?.trim() || e.message || 'git command failed');
  }
}

/** Run a `git` subcommand for its stdout; returns null instead of throwing. */
async function gitOutput(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, { env: process.env, timeout: 15_000 });
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Pull the human-readable reason out of a failed GitHub REST response. A 422
 * carries a top-level `message` plus an `errors[]` array (e.g. "No commits
 * between main and my-branch", or an invalid `base` field) — far more useful
 * than the bare status code. Returns '' when the body isn't the expected JSON.
 */
async function githubErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      message?: string;
      errors?: { message?: string; field?: string; code?: string }[];
    };
    const parts = [
      body.message,
      ...(body.errors ?? []).map((e) => e.message ?? [e.field, e.code].filter(Boolean).join(' ')),
    ].filter((p): p is string => !!p && p !== 'Validation Failed');
    return parts.join(' — ');
  } catch {
    return '';
  }
}

/** Parse a GitHub remote (https or ssh) into owner/name + a clean https clone URL. */
function parseGithubRemote(
  remote: string,
): { owner: string; fullName: string; cloneUrl: string } | null {
  // git@github.com:owner/repo.git  or  https://github.com/owner/repo(.git)
  const match = remote.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  const owner = match?.[1];
  const name = match?.[2];
  if (!owner || !name) return null;
  return { owner, fullName: `${owner}/${name}`, cloneUrl: `https://github.com/${owner}/${name}.git` };
}

/** Shape of the fields we read off a GitHub REST `repos` item. */
type GithubApiRepo = {
  name: string;
  full_name: string;
  clone_url: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  updated_at: string;
  owner: { login: string };
};

/** The `pulls` list fields we read to locate + classify a branch's PR. */
type GithubApiPull = {
  number: number;
  html_url: string;
  state: 'open' | 'closed';
  merged_at: string | null;
  head: { sha: string };
};

/** A GitHub check-run (the Checks API) — `status` is the run's lifecycle. */
type GithubApiCheckRun = { status: string; conclusion: string | null };

/** A legacy commit status (the Statuses API) rolled into the combined endpoint. */
type GithubApiCommitStatus = { state: string };

/** Conclusions that count a completed check as failed. */
const FAILED_CONCLUSIONS = ['failure', 'timed_out', 'cancelled', 'action_required', 'stale'];

function toGithubRepo(r: GithubApiRepo): GithubRepo {
  return {
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    cloneUrl: r.clone_url,
    description: r.description,
    private: r.private,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at,
  };
}

export class GithubService {
  /** The linked account's token — the stored secret, or a live `gh` read. */
  private async token(): Promise<string> {
    const token = getSecret(SecretName.GithubToken) ?? (await authService.readGithubToken());
    if (!token) {
      throw new Error('No linked GitHub account. Connect GitHub from the Connect screen first.');
    }
    return token;
  }

  /** Repositories the linked account can access, most-recently-updated first. */
  async listRepos(): Promise<GithubRepo[]> {
    const token = await this.token();
    const url = new URL('/user/repos', GITHUB_API);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('affiliation', 'owner,collaborator,organization_member');

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status}): failed to list repositories.`);
    }
    const repos = (await res.json()) as GithubApiRepo[];
    return repos.map(toGithubRepo);
  }

  /**
   * Clone a repo into `~/FlowState/projects/<name>` and return its local path +
   * default branch. Errors if the destination already exists.
   */
  async cloneRepo(input: AddProjectInput): Promise<{ localPath: string; defaultBranch: string }> {
    const token = await this.token();
    const name = input.fullName.split('/').pop() ?? input.fullName;
    const localPath = join(PROJECTS_DIR, name);

    if (existsSync(localPath)) {
      throw new Error(`A folder already exists at ${localPath}. Remove it or rename the clone.`);
    }
    await mkdir(PROJECTS_DIR, { recursive: true });

    const authedUrl = `https://x-access-token:${token}@github.com/${input.fullName}.git`;
    await git(['clone', authedUrl, localPath]);
    // Scrub the token from the persisted remote.
    await git(['-C', localPath, 'remote', 'set-url', 'origin', input.cloneUrl]);

    return { localPath, defaultBranch: input.defaultBranch };
  }

  /**
   * Describe an existing local folder as a project. Reads its git `origin`
   * remote + current branch when available; falls back to the folder name and
   * `main` for a non-git (or remote-less) directory.
   */
  async describeLocal(localPath: string): Promise<{
    owner: string;
    name: string;
    fullName: string;
    cloneUrl: string;
    defaultBranch: string;
  }> {
    const name = basename(localPath);
    const origin = await gitOutput(['-C', localPath, 'remote', 'get-url', 'origin']);
    const parsed = origin ? parseGithubRemote(origin) : null;
    const branch = await gitOutput(['-C', localPath, 'branch', '--show-current']);

    return {
      owner: parsed?.owner ?? '',
      name,
      fullName: parsed?.fullName ?? name,
      cloneUrl: parsed?.cloneUrl ?? origin ?? '',
      defaultBranch: branch ?? 'main',
    };
  }

  /////////////////////////
  // Sync (push/pull/fetch)
  /////////////////////////

  /**
   * A worktree's GitHub `origin`, parsed. Throws with a clear message when the
   * remote is missing or not a GitHub URL (the UI gates push/PR on this).
   */
  private async githubOrigin(
    worktreePath: string,
  ): Promise<{ owner: string; fullName: string }> {
    const origin = await gitOutput(['-C', worktreePath, 'remote', 'get-url', 'origin']);
    const parsed = origin ? parseGithubRemote(origin) : null;
    if (!parsed) {
      throw new Error('This worktree has no GitHub `origin` remote.');
    }
    return { owner: parsed.owner, fullName: parsed.fullName };
  }

  /**
   * `-c http.extraHeader=…` args that inject the linked token as HTTP basic auth
   * for a single git invocation — never persisted to `.git/config`. Scoped to
   * github.com so the token is only ever sent to GitHub.
   */
  private async authHeaderArgs(): Promise<string[]> {
    const token = await this.token();
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
    return ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`];
  }

  /** Fetch `origin` to refresh the worktree's ahead/behind counts. */
  async fetch(worktreePath: string): Promise<void> {
    await this.githubOrigin(worktreePath);
    const auth = await this.authHeaderArgs();
    await git(['-C', worktreePath, ...auth, 'fetch', 'origin']);
  }

  /** Fast-forward the current branch from its upstream. */
  async pull(worktreePath: string): Promise<void> {
    await this.githubOrigin(worktreePath);
    const auth = await this.authHeaderArgs();
    await git(['-C', worktreePath, ...auth, 'pull', '--ff-only']);
  }

  /** Push `branch` to `origin`, setting it as the branch's upstream. */
  async push(worktreePath: string, branch: string): Promise<void> {
    await this.githubOrigin(worktreePath);
    const auth = await this.authHeaderArgs();
    await git(['-C', worktreePath, ...auth, 'push', '-u', 'origin', branch]);
  }

  /**
   * Open a pull request for `head` against `base`. If one already exists for the
   * branch, returns that PR instead of failing.
   */
  async createPullRequest(input: {
    worktreePath: string;
    head: string;
    base: string;
    title: string;
    body?: string;
  }): Promise<CreatePrResult> {
    const token = await this.token();
    const { owner, fullName } = await this.githubOrigin(input.worktreePath);
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const res = await fetch(`${GITHUB_API}/repos/${fullName}/pulls`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: input.title,
        head: input.head,
        base: input.base,
        body: input.body ?? '',
      }),
    });

    if (res.ok) {
      const pr = (await res.json()) as { html_url: string; number: number };
      return { url: pr.html_url, number: pr.number };
    }

    // A PR already open for this branch → surface it instead of erroring.
    if (res.status === 422) {
      const existing = await this.findOpenPr(fullName, owner, input.head, token);
      if (existing) return existing;
    }
    // Surface GitHub's actual reason (no commits vs base, invalid base branch,
    // etc.) rather than a bare status code.
    const detail = await githubErrorDetail(res);
    throw new Error(
      detail
        ? `Couldn't open the pull request: ${detail}.`
        : `Couldn't open the pull request (GitHub API error ${res.status}).`,
    );
  }

  /** The open PR whose head is `owner:branch`, if any. */
  private async findOpenPr(
    fullName: string,
    owner: string,
    branch: string,
    token: string,
  ): Promise<CreatePrResult | null> {
    const url = new URL(`/repos/${fullName}/pulls`, GITHUB_API);
    url.searchParams.set('head', `${owner}:${branch}`);
    url.searchParams.set('state', 'open');
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return null;
    const prs = (await res.json()) as { html_url: string; number: number }[];
    const pr = prs[0];
    return pr ? { url: pr.html_url, number: pr.number } : null;
  }

  /////////////////////////
  // PR status (header)
  /////////////////////////

  /**
   * The pull request for `branch` (the most recently updated open-or-merged one)
   * with its rolled-up CI + merge signal, or `null` when the branch has no PR.
   * Drives the worktree header: "N checks pending" / "Ready to merge" / merged →
   * "Delete Worktree". Checks are only rolled up while the PR is open.
   */
  async prStatus(worktreePath: string, branch: string): Promise<PrStatus | null> {
    const token = await this.token();
    const { owner, fullName } = await this.githubOrigin(worktreePath);
    const headers = this.apiHeaders(token);

    const url = new URL(`/repos/${fullName}/pulls`, GITHUB_API);
    url.searchParams.set('head', `${owner}:${branch}`);
    url.searchParams.set('state', 'all');
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');
    url.searchParams.set('per_page', '1');

    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const pr = ((await res.json()) as GithubApiPull[])[0];
    if (!pr) return null;

    const state = pr.merged_at
      ? PrState.Merged
      : pr.state === 'closed'
        ? PrState.Closed
        : PrState.Open;

    // A merged/closed PR needs no CI or mergeability — the header only cares
    // that it's merged (→ offer worktree deletion).
    if (state !== PrState.Open) {
      return { number: pr.number, url: pr.html_url, state, checks: PrChecks.None, pending: 0, mergeable: false };
    }

    const [checks, mergeable] = await Promise.all([
      this.rollupChecks(fullName, pr.head.sha, headers),
      this.readMergeable(fullName, pr.number, headers),
    ]);
    return { number: pr.number, url: pr.html_url, state, checks: checks.state, pending: checks.pending, mergeable };
  }

  /** Standard authenticated GitHub REST headers. */
  private apiHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  /**
   * Roll up a head commit's checks across both the Checks API (`check-runs`) and
   * the legacy combined Statuses API, since repos use one or the other. Failing
   * beats pending beats passing; no checks at all → `None`.
   */
  private async rollupChecks(
    fullName: string,
    sha: string,
    headers: Record<string, string>,
  ): Promise<{ state: PrChecks; pending: number }> {
    let total = 0;
    let pending = 0;
    let failing = 0;
    const tally = (isPending: boolean, isFailing: boolean) => {
      total += 1;
      if (isPending) pending += 1;
      else if (isFailing) failing += 1;
    };

    const runsRes = await fetch(`${GITHUB_API}/repos/${fullName}/commits/${sha}/check-runs`, { headers });
    if (runsRes.ok) {
      const runs = ((await runsRes.json()) as { check_runs?: GithubApiCheckRun[] }).check_runs ?? [];
      for (const run of runs) {
        const done = run.status === 'completed';
        tally(!done, done && FAILED_CONCLUSIONS.includes(run.conclusion ?? ''));
      }
    }

    const statusRes = await fetch(`${GITHUB_API}/repos/${fullName}/commits/${sha}/status`, { headers });
    if (statusRes.ok) {
      const statuses = ((await statusRes.json()) as { statuses?: GithubApiCommitStatus[] }).statuses ?? [];
      for (const s of statuses) {
        tally(s.state === 'pending', s.state === 'failure' || s.state === 'error');
      }
    }

    const state =
      failing > 0
        ? PrChecks.Failing
        : pending > 0
          ? PrChecks.Pending
          : total > 0
            ? PrChecks.Passing
            : PrChecks.None;
    return { state, pending };
  }

  /**
   * Whether the PR merges cleanly (no conflicts). GitHub returns `mergeable:
   * null` while it computes the check (common right after a PR opens), so retry
   * once after a short wait before giving up rather than flashing a false
   * "conflict" in the header.
   */
  private async readMergeable(
    fullName: string,
    number: number,
    headers: Record<string, string>,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await fetch(`${GITHUB_API}/repos/${fullName}/pulls/${number}`, { headers });
      if (!res.ok) return false;
      const { mergeable } = (await res.json()) as { mergeable: boolean | null };
      if (mergeable !== null) return mergeable;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    return false;
  }
}

/** Shared singleton — the projects router talks to one instance. */
export const githubService = new GithubService();
