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
import type { AddProjectInput, CreatePrResult, GithubRepo } from '@flowstate/shared';
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
    throw new Error(`GitHub API error (${res.status}): failed to open pull request.`);
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
}

/** Shared singleton — the projects router talks to one instance. */
export const githubService = new GithubService();
