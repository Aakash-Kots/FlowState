/**
 * WorktreeService — a thin wrapper over `git worktree add/list/remove` (via
 * simple-git). A worktree is the on-disk half of a workspace: a second checkout
 * of the project's repo on its own branch, so several Claude sessions can work
 * separate branches in parallel. Worktrees live in a sibling `<repo>-worktrees/`
 * directory (see WORKTREES_DIR_SUFFIX) so they never nest inside the clone.
 */
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
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

///////////////
// Constants //
///////////////

/** Longest slug we derive from a chat title — keeps branch names tidy. */
const SLUG_MAX_LENGTH = 40;

/** Ref namespaces the branch picker draws from — local branches plus `origin`'s. */
const BRANCH_REF_PREFIXES = ['refs/heads/', 'refs/remotes/origin/'];

/** `origin`'s default-branch symref — a pointer, not a branch; never offered. */
const ORIGIN_HEAD_REF = 'refs/remotes/origin/HEAD';

/////////////
// Helpers //
/////////////

/** Turn a branch name into a filesystem-safe directory segment. */
function slugifyBranch(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'worktree';
}

/**
 * Turn a free-text chat title into a lowercase, hyphenated git branch slug
 * (e.g. "Add User Auth" → "add-user-auth"). Falls back to "worktree" if the
 * title has no usable characters.
 */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
  return slug || 'worktree';
}

/**
 * Parse `git for-each-ref --format=%(refname)` into bare branch names: strips the
 * `refs/heads/` / `refs/remotes/origin/` prefixes, skips `origin`'s HEAD symref,
 * and collapses the local/remote pair for one branch onto a single entry.
 */
function parseBranchRefs(out: string): string[] {
  const names = new Set<string>();
  for (const line of out.split('\n')) {
    const ref = line.trim();
    if (!ref || ref === ORIGIN_HEAD_REF) continue;
    const prefix = BRANCH_REF_PREFIXES.find((p) => ref.startsWith(p));
    if (prefix) names.add(ref.slice(prefix.length));
  }
  return [...names].sort();
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

  /**
   * Create a worktree on a fresh `branch` cut from `baseRef`. Prefers the
   * remote-tracking `origin/<baseRef>` when it exists (the caller fetches first)
   * so the worktree is cut from the latest base, not a stale local branch.
   */
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
    const startPoint = (await this.remoteBranchExists(git, opts.baseRef))
      ? `origin/${opts.baseRef}`
      : opts.baseRef;
    // `--no-track` keeps the new branch upstream-less even when cut from the
    // remote ref, so its ahead/behind header and first push stay correct.
    await git.raw(['worktree', 'add', '--no-track', '-b', opts.branch, opts.worktreePath, startPoint]);
    return { path: opts.worktreePath, branch: opts.branch, head: startPoint };
  }

  /** Whether an up-to-date `origin/<branch>` remote-tracking ref exists locally. */
  private async remoteBranchExists(git: SimpleGit, branch: string): Promise<boolean> {
    try {
      await git.raw(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The base-ref choices for a new worktree: every local branch plus every
   * `origin/` branch, shown under its bare name and sorted alphabetically. A
   * remote-only name is a valid base ref — `create` resolves it via
   * `origin/<ref>`. This read is purely local; callers that want branches pushed
   * from elsewhere run `githubService.refreshRemoteBranches` first.
   */
  async listBranches(repoRoot: string): Promise<string[]> {
    // `%(refname)`, not `%(refname:short)` — the short form renders
    // `refs/remotes/origin/HEAD` as the bare string "origin", a phantom branch.
    const out = await simpleGit(repoRoot).raw([
      'for-each-ref',
      '--format=%(refname)',
      'refs/heads',
      'refs/remotes/origin',
    ]);
    return parseBranchRefs(out);
  }

  /**
   * A slug of `title` that doesn't collide with an existing local branch —
   * appends `-2`, `-3`, … until free. Used for both the random creation name
   * and the auto-title rename.
   */
  async uniqueBranchName(repoRoot: string, desired: string): Promise<string> {
    const taken = new Set((await simpleGit(repoRoot).branchLocal()).all);
    if (!taken.has(desired)) return desired;
    for (let n = 2; ; n++) {
      const candidate = `${desired}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  /**
   * Rename a worktree's branch in place (`git branch -m`), resolving collisions
   * first. Git updates the linked worktree's HEAD; the on-disk directory keeps
   * its original name (never surfaced in the UI). Returns the name actually used.
   */
  async renameBranch(opts: {
    repoRoot: string;
    oldBranch: string;
    newBranch: string;
  }): Promise<string> {
    const target = await this.uniqueBranchName(opts.repoRoot, opts.newBranch);
    if (target === opts.oldBranch) return opts.oldBranch;
    await simpleGit(opts.repoRoot).raw(['branch', '-m', opts.oldBranch, target]);
    return target;
  }

  /** All worktrees registered on the repo. */
  async list(repoRoot: string): Promise<WorktreeInfo[]> {
    const out = await simpleGit(repoRoot).raw(['worktree', 'list', '--porcelain']);
    return parseWorktreeList(out);
  }

  /**
   * Remove a worktree from disk + the repo's registry (caller guards dirtiness).
   * Tolerant of an already-gone worktree: if `git worktree remove` fails but the
   * path no longer exists (or git no longer tracks it), the worktree is
   * effectively gone — prune the stale registry entry and return successfully so
   * callers can still delete its row. Real failures (e.g. a dirty worktree with
   * no `--force`) still throw.
   */
  async remove(opts: { repoRoot: string; worktreePath: string; force?: boolean }): Promise<void> {
    const git = simpleGit(opts.repoRoot);
    const args = ['worktree', 'remove', opts.worktreePath];
    if (opts.force) args.push('--force');
    try {
      await git.raw(args);
    } catch (err) {
      if (existsSync(opts.worktreePath) && (await this.isRegistered(opts.repoRoot, opts.worktreePath))) {
        throw err; // Still present and tracked — a genuine failure.
      }
      // Already gone: clear any stale registry entry and treat it as removed.
      await git.raw(['worktree', 'prune']).catch(() => {});
    }
  }

  /** Whether `worktreePath` is still a registered worktree on the repo. */
  private async isRegistered(repoRoot: string, worktreePath: string): Promise<boolean> {
    try {
      return (await this.list(repoRoot)).some((w) => w.path === worktreePath);
    } catch {
      return false;
    }
  }
}

/** Shared singleton — the worktree router talks to one instance. */
export const worktreeService = new WorktreeService();
