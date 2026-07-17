/**
 * Git domain types (main process) — in-memory shapes the git services pass
 * around that never cross an IPC boundary directly (so no zod schema needed).
 */

/** One commit from `git log`, with its author date and line/file counts. */
export type CommitLogEntry = {
  hash: string;
  /** ISO-8601 author date (`%aI`) — used to bucket the commit by local day. */
  authorDateIso: string;
  insertions: number;
  deletions: number;
  filesChanged: number;
};
