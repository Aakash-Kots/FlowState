/**
 * Git domain types — the worktree-scoped changes view: uncommitted changes, a
 * single file's diff, and the commit/push/PR inputs. A workspace is one git
 * worktree, so every shape here is keyed by `workspaceId` at the router
 * boundary. Validation lives in `../schemas/git`.
 */
import type { GitFileStatus } from '../enums/git';

/** One changed path in the worktree, on either the staged or unstaged side. */
export type GitChange = {
  path: string;
  status: GitFileStatus;
  /** True when the change is in the index (staged), false for the working tree. */
  staged: boolean;
  insertions: number;
  deletions: number;
  /** Prior path for a rename; absent otherwise. */
  oldPath?: string;
};

/** A worktree's uncommitted state plus its branch/upstream sync position. */
export type GitStatus = {
  branch: string;
  /** Tracking branch (e.g. `origin/feature`); null when the branch has no upstream. */
  upstream: string | null;
  ahead: number;
  behind: number;
  /** True when the repo has an `origin` remote (gates push/PR in the UI). */
  hasRemote: boolean;
  staged: GitChange[];
  unstaged: GitChange[];
};

/**
 * Aggregate line-change counts for a worktree relative to its base branch
 * (committed + uncommitted tracked changes) — drives the sidebar's +/- badge.
 */
export type GitDiffStat = {
  insertions: number;
  deletions: number;
  filesChanged: number;
};

/** A single file's unified diff patch for the diff panel. */
export type GitFileDiff = {
  path: string;
  /** Unified-diff text (empty for a binary or unchanged file). */
  patch: string;
  binary: boolean;
};

/** Input to commit the staged changes of a worktree. */
export type CommitInput = {
  workspaceId: string;
  summary: string;
  description?: string;
};

/** Input to open a pull request for a worktree's branch. */
export type CreatePrInput = {
  workspaceId: string;
  title: string;
  body?: string;
};

/** The opened pull request. */
export type CreatePrResult = {
  url: string;
  number: number;
};
