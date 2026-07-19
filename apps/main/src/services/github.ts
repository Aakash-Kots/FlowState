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
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import type {
  AddProjectInput,
  CreatePrResult,
  GithubContributionCalendar,
  GithubContributionDay,
  GithubRepo,
  GithubViewer,
  PrStatus,
} from '@flowstate/shared';
import { GithubContributionLevel, PrChecks, PrState } from '@flowstate/shared';
import { PROJECTS_DIR } from '../lib/constants/project';
import { SecretName } from '../lib/enums/secret';
import { getSecret } from '../store/secrets';
import { authService } from './auth';

///////////////
// Constants //
///////////////

const GITHUB_API = 'https://api.github.com';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

/**
 * How long the viewer's contribution calendar stays cached (ms). It changes at
 * most a few times a day, but the analytics page re-queries on every open — a
 * 10-minute TTL collapses repeated opens onto one GraphQL round-trip.
 */
const CONTRIBUTIONS_TTL_MS = 10 * 60_000;

/** GraphQL for the viewer's trailing-year contribution calendar. */
const CONTRIBUTIONS_QUERY = `query {
  viewer {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
          }
        }
      }
    }
  }
}`;

/**
 * How long a branch's PR status stays cached (ms). The header polls every ~20s
 * and every sidebar row + focus/archive read hits this same call; without a
 * cache each read fans out to 3 GitHub REST requests. A short TTL collapses a
 * focus burst onto one result while staying fresh against the poll.
 */
const PR_STATUS_TTL_MS = 15_000;

/** How long a worktree's parsed `origin` remote stays cached (ms) — it ~never changes. */
const ORIGIN_TTL_MS = 5 * 60_000;

/////////////
// Helpers //
/////////////

const execFileAsync = promisify(execFile);

/** Per-(worktree, branch) PR-status cache; only definitive results are stored. */
const prStatusCache = new Map<string, { value: PrStatus | null; expiresAt: number }>();

/** Per-worktree parsed `origin` cache. */
const originCache = new Map<string, { value: { owner: string; fullName: string }; expiresAt: number }>();

/** The viewer's contribution calendar cache (single viewer per app). */
let contributionsCache: { value: GithubContributionCalendar; expiresAt: number } | null = null;

/** GitHub's contribution-level buckets → a 0–4 heat step. */
const CONTRIBUTION_LEVELS: Record<GithubContributionLevel, number> = {
  [GithubContributionLevel.None]: 0,
  [GithubContributionLevel.FirstQuartile]: 1,
  [GithubContributionLevel.SecondQuartile]: 2,
  [GithubContributionLevel.ThirdQuartile]: 3,
  [GithubContributionLevel.FourthQuartile]: 4,
};

/** The GraphQL contribution-calendar response shape (the fields we select). */
type GithubApiContributions = {
  data?: {
    viewer?: {
      contributionsCollection?: {
        contributionCalendar?: {
          totalContributions: number;
          weeks: {
            contributionDays: {
              date: string;
              contributionCount: number;
              contributionLevel: GithubContributionLevel;
            }[];
          }[];
        };
      };
    };
  };
  errors?: { message: string }[];
};

/** Map a GraphQL contribution day (snake-ish wire) → the domain day. */
function toContributionDay(d: {
  date: string;
  contributionCount: number;
  contributionLevel: GithubContributionLevel;
}): GithubContributionDay {
  return {
    day: d.date,
    count: d.contributionCount,
    level: CONTRIBUTION_LEVELS[d.contributionLevel] ?? 0,
  };
}

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
  return {
    owner,
    fullName: `${owner}/${name}`,
    cloneUrl: `https://github.com/${owner}/${name}.git`,
  };
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
  title: string;
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

  /** The linked account's own login + profile avatar (drives the sidebar fallback). */
  async viewer(): Promise<GithubViewer> {
    const token = await this.token();
    const res = await fetch(`${GITHUB_API}/user`, { headers: this.apiHeaders(token) });
    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status}): failed to read the linked account.`);
    }
    const user = (await res.json()) as { login: string; avatar_url: string };
    return { login: user.login, avatarUrl: user.avatar_url };
  }

  /**
   * The linked account's own contribution calendar for the trailing year — the
   * data behind the GitHub-style heatmap on the analytics page. Cached in memory
   * (see `CONTRIBUTIONS_TTL_MS`) since the analytics page re-queries on every open.
   */
  async contributionCalendar(): Promise<GithubContributionCalendar> {
    if (contributionsCache && contributionsCache.expiresAt > Date.now()) {
      return contributionsCache.value;
    }

    const token = await this.token();
    const res = await fetch(GITHUB_GRAPHQL, {
      method: 'POST',
      headers: { ...this.apiHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: CONTRIBUTIONS_QUERY }),
    });
    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status}): failed to read your contributions.`);
    }

    const body = (await res.json()) as GithubApiContributions;
    if (body.errors?.length) {
      throw new Error(`GitHub API error: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    const calendar = body.data?.viewer?.contributionsCollection?.contributionCalendar;
    if (!calendar) {
      throw new Error('GitHub API error: no contribution calendar returned.');
    }

    const value: GithubContributionCalendar = {
      totalContributions: calendar.totalContributions,
      weeks: calendar.weeks.map((week) => week.contributionDays.map(toContributionDay)),
    };
    contributionsCache = { value, expiresAt: Date.now() + CONTRIBUTIONS_TTL_MS };
    return value;
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
   * remote + the repo's real default branch when available; falls back to the
   * folder name and `main` for a non-git (or remote-less) directory.
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

    // Prefer the repo's true default branch (`origin/HEAD`) over whatever happens
    // to be checked out right now, so new worktrees don't cut from a stray branch.
    // `symbolic-ref` yields e.g. `origin/main`; strip the remote prefix. Fall back
    // to the current branch, then `main`, for a bare/remote-less directory.
    const originHead = await gitOutput([
      '-C',
      localPath,
      'symbolic-ref',
      '--short',
      'refs/remotes/origin/HEAD',
    ]);
    const defaultFromRemote = originHead?.replace(/^origin\//, '') ?? null;
    const currentBranch = await gitOutput(['-C', localPath, 'branch', '--show-current']);

    return {
      owner: parsed?.owner ?? '',
      name,
      fullName: parsed?.fullName ?? name,
      cloneUrl: parsed?.cloneUrl ?? origin ?? '',
      defaultBranch: defaultFromRemote ?? currentBranch ?? 'main',
    };
  }

  /////////////////////////
  // Sync (push/pull/fetch)
  /////////////////////////

  /**
   * A worktree's GitHub `origin`, parsed. Throws with a clear message when the
   * remote is missing or not a GitHub URL (the UI gates push/PR on this).
   */
  private async githubOrigin(worktreePath: string): Promise<{ owner: string; fullName: string }> {
    const cached = originCache.get(worktreePath);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const origin = await gitOutput(['-C', worktreePath, 'remote', 'get-url', 'origin']);
    const parsed = origin ? parseGithubRemote(origin) : null;
    if (!parsed) {
      throw new Error('This worktree has no GitHub `origin` remote.');
    }
    const value = { owner: parsed.owner, fullName: parsed.fullName };
    originCache.set(worktreePath, { value, expiresAt: Date.now() + ORIGIN_TTL_MS });
    return value;
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

  /**
   * Best-effort fast-forward of local `base` to `origin/<base>`, so new worktrees
   * are cut from an up-to-date base. Never rewrites history and never touches a
   * dirty tree: if `base` is checked out in this repo it's ff-merged only when the
   * tree is clean; otherwise the ref is fast-forwarded directly (git refuses a
   * non-fast-forward, protecting a diverged local base). All failures are swallowed.
   */
  async syncBaseBranch(repoRoot: string, base: string): Promise<void> {
    const auth = await this.authHeaderArgs();
    try {
      // `base` not checked out anywhere → FF the ref directly (refuses non-FF).
      await git(['-C', repoRoot, ...auth, 'fetch', 'origin', `${base}:${base}`]);
    } catch {
      // `base` is checked out here → ff-only merge, but only if the tree is clean.
      try {
        const head = await gitOutput(['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD']);
        const dirty = await gitOutput(['-C', repoRoot, 'status', '--porcelain']);
        if (head === base && !dirty) {
          await git(['-C', repoRoot, 'merge', '--ff-only', `origin/${base}`]);
        }
      } catch {
        // give up quietly — the badge fix keeps the sidebar correct regardless.
      }
    }
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
    // A push changes CI/PR state — drop the cache so the next read is fresh.
    this.invalidatePrStatus(worktreePath, branch);
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
      // A new PR exists now — drop any cached "no PR" for this branch.
      this.invalidatePrStatus(input.worktreePath, input.head);
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

  /**
   * Merge the open PR for `branch` into its base. Looks the PR up by head branch,
   * then asks GitHub to merge it; surfaces GitHub's reason (not mergeable, checks
   * required, etc.) rather than a bare status code. Throws when the branch has no
   * open PR.
   */
  async mergePullRequest(worktreePath: string, branch: string): Promise<void> {
    const token = await this.token();
    const { owner, fullName } = await this.githubOrigin(worktreePath);
    const existing = await this.findOpenPr(fullName, owner, branch, token);
    if (!existing) {
      throw new Error('No open pull request to merge for this branch.');
    }

    const res = await fetch(`${GITHUB_API}/repos/${fullName}/pulls/${existing.number}/merge`, {
      method: 'PUT',
      headers: this.apiHeaders(token),
      body: JSON.stringify({}),
    });
    if (res.ok) {
      // The PR is now merged — drop the cache so the header flips promptly.
      this.invalidatePrStatus(worktreePath, branch);
      return;
    }

    const detail = await githubErrorDetail(res);
    throw new Error(
      detail
        ? `Couldn't merge the pull request: ${detail}.`
        : `Couldn't merge the pull request (GitHub API error ${res.status}).`,
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
    const key = `${worktreePath}\n${branch}`;
    const cached = prStatusCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await this.computePrStatus(worktreePath, branch);
    prStatusCache.set(key, { value, expiresAt: Date.now() + PR_STATUS_TTL_MS });
    return value;
  }

  /** Invalidate the cached PR status for a branch — call after a mutation (push/merge). */
  private invalidatePrStatus(worktreePath: string, branch: string): void {
    prStatusCache.delete(`${worktreePath}\n${branch}`);
  }

  private async computePrStatus(worktreePath: string, branch: string): Promise<PrStatus | null> {
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
      return {
        number: pr.number,
        url: pr.html_url,
        title: pr.title,
        state,
        checks: PrChecks.None,
        pending: 0,
        mergeable: false,
      };
    }

    const [checks, mergeable] = await Promise.all([
      this.rollupChecks(fullName, pr.head.sha, headers),
      this.readMergeable(fullName, pr.number, headers),
    ]);
    return {
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      state,
      checks: checks.state,
      pending: checks.pending,
      mergeable,
    };
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

    const runsRes = await fetch(`${GITHUB_API}/repos/${fullName}/commits/${sha}/check-runs`, {
      headers,
    });
    if (runsRes.ok) {
      const runs =
        ((await runsRes.json()) as { check_runs?: GithubApiCheckRun[] }).check_runs ?? [];
      for (const run of runs) {
        const done = run.status === 'completed';
        tally(!done, done && FAILED_CONCLUSIONS.includes(run.conclusion ?? ''));
      }
    }

    const statusRes = await fetch(`${GITHUB_API}/repos/${fullName}/commits/${sha}/status`, {
      headers,
    });
    if (statusRes.ok) {
      const statuses =
        ((await statusRes.json()) as { statuses?: GithubApiCommitStatus[] }).statuses ?? [];
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
