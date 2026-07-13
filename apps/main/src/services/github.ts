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
import type { AddProjectInput, GithubRepo } from '@flowstate/shared';
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
}

/** Shared singleton — the projects router talks to one instance. */
export const githubService = new GithubService();
