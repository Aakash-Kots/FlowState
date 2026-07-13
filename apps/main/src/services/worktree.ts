/**
 * WorktreeService — a thin wrapper over `git worktree add/list/remove` (via
 * simple-git). A worktree is the on-disk half of a workspace: a second checkout
 * of the project's repo on its own branch, so several Claude sessions can work
 * separate branches in parallel. Worktrees live in a sibling `<repo>-worktrees/`
 * directory (see WORKTREES_DIR_SUFFIX) so they never nest inside the clone.
 */
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { simpleGit } from 'simple-git';
import { WORKTREES_DIR_SUFFIX } from '../lib/constants/worktree';

///////////
// Types //
///////////

/** One git worktree registered on a repo. */
export type WorktreeInfo = {
  path: string;
  branch: string;
  head: string;
};

/////////////
// Helpers //
/////////////

/** Turn a branch name into a filesystem-safe directory segment. */
function slugifyBranch(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'worktree';
}

/** Parse `git worktree list --porcelain` into structured records. */
function parseWorktreeList(porcelain: string): WorktreeInfo[] {
  const result: WorktreeInfo[] = [];
  let path: string | null = null;
  let head = '';
  let branch = '';
  const flush = () => {
    if (path) result.push({ path, head, branch });
    path = null;
    head = '';
    branch = '';
  };
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush();
      path = line.slice('worktree '.length);
    } else if (line.startsWith('HEAD ')) {
      head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    }
  }
  flush();
  return result;
}

export class WorktreeService {
  /**
   * Deterministic on-disk location for a branch's worktree:
   * `<repoParent>/<repoName>-worktrees/<branch-slug>`.
   */
  worktreePathFor(repoRoot: string, branch: string): string {
    const dir = `${basename(repoRoot)}${WORKTREES_DIR_SUFFIX}`;
    return join(dirname(repoRoot), dir, slugifyBranch(branch));
  }

  /** Create a worktree on a fresh `branch` cut from `baseRef`. */
  async create(opts: {
    repoRoot: string;
    branch: string;
    baseRef: string;
    worktreePath: string;
  }): Promise<WorktreeInfo> {
    const git = simpleGit(opts.repoRoot);
    const branches = await git.branchLocal();
    if (branches.all.includes(opts.branch)) {
      throw new Error(`Branch "${opts.branch}" already exists.`);
    }
    if (existsSync(opts.worktreePath)) {
      throw new Error(`A folder already exists at ${opts.worktreePath}.`);
    }
    await git.raw(['worktree', 'add', '-b', opts.branch, opts.worktreePath, opts.baseRef]);
    return { path: opts.worktreePath, branch: opts.branch, head: opts.baseRef };
  }

  /** The repo's local branch names — the choices for a new worktree's base ref. */
  async listBranches(repoRoot: string): Promise<string[]> {
    return (await simpleGit(repoRoot).branchLocal()).all;
  }

  /** All worktrees registered on the repo. */
  async list(repoRoot: string): Promise<WorktreeInfo[]> {
    const out = await simpleGit(repoRoot).raw(['worktree', 'list', '--porcelain']);
    return parseWorktreeList(out);
  }

  /** Remove a worktree from disk + the repo's registry (caller guards dirtiness). */
  async remove(opts: { repoRoot: string; worktreePath: string; force?: boolean }): Promise<void> {
    const args = ['worktree', 'remove', opts.worktreePath];
    if (opts.force) args.push('--force');
    await simpleGit(opts.repoRoot).raw(args);
  }
}

/** Shared singleton — the worktree router talks to one instance. */
export const worktreeService = new WorktreeService();
