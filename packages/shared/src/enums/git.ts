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
