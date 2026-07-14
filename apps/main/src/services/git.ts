/**
 * GitService — wraps the system `git` (via simple-git) for a single worktree.
 * Covers the worktree-scoped changes view: status, per-file diff, stage/unstage,
 * discard, and commit. Push/pull/fetch + PR creation live in `GithubService`
 * (they need the linked account's token); this service is purely local.
 */
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GitFileStatus,
  type GitChange,
  type GitDiffStat,
  type GitFileDiff,
  type GitStatus,
  type TurnFileChange,
} from '@flowstate/shared';
import { simpleGit, type SimpleGit } from 'simple-git';

/////////////
// Helpers //
/////////////

/** Map a porcelain status code (index or working-dir column) to our enum. */
function mapCode(code: string): GitFileStatus | null {
  switch (code) {
    case 'M':
      return GitFileStatus.Modified;
    case 'A':
      return GitFileStatus.Added;
    case 'D':
      return GitFileStatus.Deleted;
    case 'R':
      return GitFileStatus.Renamed;
    case 'C':
      return GitFileStatus.Added; // copied ≈ added
    case 'U':
      return GitFileStatus.Conflicted;
    default:
      return null; // ' ' (unchanged on this side) or '?'/'!' handled separately
  }
}

/** Per-file insertion/deletion counts, keyed by path, from a `git diff` summary. */
async function diffCounts(
  git: SimpleGit,
  extraArgs: string[],
): Promise<Map<string, { insertions: number; deletions: number }>> {
  const summary = await git.diffSummary(extraArgs);
  const counts = new Map<string, { insertions: number; deletions: number }>();
  for (const f of summary.files) {
    counts.set(f.file, {
      insertions: 'insertions' in f ? f.insertions : 0,
      deletions: 'deletions' in f ? f.deletions : 0,
    });
  }
  return counts;
}

export class GitService {
  constructor(private readonly worktreePath: string) {}

  private get git(): SimpleGit {
    return simpleGit(this.worktreePath);
  }

  /** True when the worktree has uncommitted changes — guards destructive removal. */
  async isDirty(): Promise<boolean> {
    const status = await this.git.status();
    return !status.isClean();
  }

  /** The worktree's uncommitted changes plus its branch/upstream sync position. */
  async status(): Promise<GitStatus> {
    const git = this.git;
    const [status, unstagedCounts, stagedCounts, remotes] = await Promise.all([
      git.status(),
      diffCounts(git, []),
      diffCounts(git, ['--cached']),
      git.getRemotes(true),
    ]);

    const staged: GitChange[] = [];
    const unstaged: GitChange[] = [];

    for (const file of status.files) {
      const path = file.path;
      // Untracked files report '?' in both columns and only exist working-side.
      if (file.index === '?' || file.working_dir === '?') {
        unstaged.push({
          path,
          status: GitFileStatus.Untracked,
          staged: false,
          insertions: 0,
          deletions: 0,
        });
        continue;
      }

      const stagedStatus = mapCode(file.index);
      if (stagedStatus) {
        const c = stagedCounts.get(path);
        staged.push({
          path,
          status: stagedStatus,
          staged: true,
          insertions: c?.insertions ?? 0,
          deletions: c?.deletions ?? 0,
        });
      }

      const unstagedStatus = mapCode(file.working_dir);
      if (unstagedStatus) {
        const c = unstagedCounts.get(path);
        unstaged.push({
          path,
          status: unstagedStatus,
          staged: false,
          insertions: c?.insertions ?? 0,
          deletions: c?.deletions ?? 0,
        });
      }
    }

    const origin = remotes.find((r) => r.name === 'origin');
    const hasRemote = !!origin && /github\.com/i.test(origin.refs.fetch ?? origin.refs.push ?? '');

    return {
      branch: status.current ?? '',
      upstream: status.tracking ?? null,
      ahead: status.ahead,
      behind: status.behind,
      hasRemote,
      staged,
      unstaged,
    };
  }

  /**
   * Total tracked line changes in this worktree relative to `baseRef`, taken
   * from the merge-base so it counts the work done on this branch (committed +
   * uncommitted) and ignores commits the base has since gained. Untracked files
   * aren't in a `git diff`, so they don't count. Returns zeros if `baseRef` can't
   * be resolved (e.g. not fetched locally).
   */
  async diffStat(baseRef: string): Promise<GitDiffStat> {
    const git = this.git;
    try {
      const mergeBase = (await git.raw(['merge-base', baseRef, 'HEAD'])).trim();
      const summary = await git.diffSummary([mergeBase]);
      return {
        insertions: summary.insertions,
        deletions: summary.deletions,
        filesChanged: summary.changed,
      };
    } catch {
      return { insertions: 0, deletions: 0, filesChanged: 0 };
    }
  }

  /**
   * Snapshot the entire working tree — tracked and untracked, honoring
   * `.gitignore` — as a git tree object, without touching the real index. Uses a
   * throwaway index file so `git add -A` (the same reconcile `commit()` runs)
   * captures the current on-disk state; the returned tree SHA is a stable handle
   * for bracketing a turn (see `turnDiff`).
   */
  async snapshotTree(): Promise<string> {
    const indexFile = join(tmpdir(), `flowstate-index-${randomUUID()}`);
    const git = simpleGit(this.worktreePath).env({ ...process.env, GIT_INDEX_FILE: indexFile });
    try {
      await git.raw(['add', '-A']);
      return (await git.raw(['write-tree'])).trim();
    } finally {
      await rm(indexFile, { force: true });
    }
  }

  /**
   * The per-file changes between an earlier `snapshotTree()` and the current
   * working tree — i.e. what a single turn touched. Diffs tree-to-tree so newly
   * created (untracked) files count too. Returns `[]` when nothing changed.
   */
  async turnDiff(fromTree: string): Promise<TurnFileChange[]> {
    const toTree = await this.snapshotTree();
    if (fromTree === toTree) return [];
    const git = this.git;

    // Line counts, keyed by path. Binary files report '-' → treat as 0.
    const [numstat, nameStatus] = await Promise.all([
      git.raw(['diff', '--numstat', fromTree, toTree]),
      git.raw(['diff', '--name-status', fromTree, toTree]),
    ]);

    const counts = new Map<string, { insertions: number; deletions: number }>();
    for (const line of numstat.split('\n')) {
      if (!line.trim()) continue;
      const [ins, del, path] = line.split('\t');
      if (!path) continue;
      counts.set(path, {
        insertions: ins === '-' ? 0 : Number(ins) || 0,
        deletions: del === '-' ? 0 : Number(del) || 0,
      });
    }

    const changes: TurnFileChange[] = [];
    for (const line of nameStatus.split('\n')) {
      if (!line.trim()) continue;
      const [code, path] = line.split('\t');
      if (!code || !path) continue;
      const status = mapCode(code);
      if (!status) continue;
      const c = counts.get(path);
      changes.push({
        path,
        status,
        insertions: c?.insertions ?? 0,
        deletions: c?.deletions ?? 0,
      });
    }
    return changes;
  }

  /** A single file's unified diff, from the index (`staged`) or the working tree. */
  async diffFile(path: string, staged: boolean): Promise<GitFileDiff> {
    const git = this.git;
    const args = staged ? ['--cached', '--', path] : ['--', path];
    let patch = await git.diff(args);

    // An untracked file has no HEAD/index entry, so `git diff` is empty —
    // synthesize an all-added patch straight from disk.
    if (!patch && !staged) {
      return this.untrackedDiff(path);
    }

    const binary = /^Binary files /m.test(patch);
    return { path, patch: binary ? '' : patch, binary };
  }

  /** Render an untracked file as an all-added diff (or flag it binary). */
  private async untrackedDiff(path: string): Promise<GitFileDiff> {
    let buf: Buffer;
    try {
      buf = await readFile(join(this.worktreePath, path));
    } catch {
      return { path, patch: '', binary: false };
    }
    if (buf.subarray(0, 8000).includes(0)) {
      return { path, patch: '', binary: true };
    }
    const lines = buf.toString('utf8').split('\n');
    // Drop a trailing empty element from a final newline so we don't emit a phantom line.
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    const body = lines.map((l) => `+${l}`).join('\n');
    const patch = `@@ -0,0 +1,${lines.length} @@\n${body}`;
    return { path, patch, binary: false };
  }

  /** Stage the given paths (adds new files, stages modifications and deletions). */
  async stage(paths: string[]): Promise<void> {
    await this.git.add(paths);
  }

  /** Unstage the given paths, leaving the working-tree changes intact. */
  async unstage(paths: string[]): Promise<void> {
    await this.git.reset(['--', ...paths]);
  }

  /** Discard working-tree changes: revert tracked paths, delete untracked ones. */
  async discard(paths: string[]): Promise<void> {
    const git = this.git;
    const status = await git.status();
    const untracked = new Set(status.not_added);
    const tracked = paths.filter((p) => !untracked.has(p));
    const toDelete = paths.filter((p) => untracked.has(p));

    if (tracked.length > 0) await git.checkout(['--', ...tracked]);
    await Promise.all(
      toDelete.map((p) => rm(join(this.worktreePath, p), { force: true, recursive: true })),
    );
  }

  /**
   * Commit every change in the worktree — modifications, deletions, and new
   * files are all staged first (`git add -A`), so the user never has to stage by
   * hand. `description` becomes the commit body.
   */
  async commit(summary: string, description?: string): Promise<{ hash: string }> {
    const git = this.git;
    await git.raw(['add', '-A']);
    const body = description?.trim();
    const message = body ? `${summary}\n\n${body}` : summary;
    const res = await git.commit(message);
    return { hash: res.commit };
  }
}
