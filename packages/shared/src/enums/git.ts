/**
 * Enumerations for the git domain, shared between the main process and the
 * renderer. Values are the wire strings, so they serialize over IPC unchanged.
 */

/**
 * How a changed file differs from HEAD (or the index). Mirrors the porcelain
 * status codes git reports; `Untracked` is a file git does not yet track,
 * `Conflicted` is an unresolved merge.
 */
export enum GitFileStatus {
  Modified = 'modified',
  Added = 'added',
  Deleted = 'deleted',
  Renamed = 'renamed',
  Untracked = 'untracked',
  Conflicted = 'conflicted',
}

/** Lifecycle of the pull request opened for a worktree's branch. */
export enum PrState {
  Open = 'open',
  Merged = 'merged',
  /** Closed without merging. */
  Closed = 'closed',
}

/** Rolled-up CI state across an open PR's head-commit checks. */
export enum PrChecks {
  /** No checks/statuses are configured on the head commit. */
  None = 'none',
  /** At least one check is still queued or running. */
  Pending = 'pending',
  /** Every check finished successfully. */
  Passing = 'passing',
  /** At least one check failed. */
  Failing = 'failing',
}
