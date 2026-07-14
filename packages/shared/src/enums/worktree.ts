/**
 * Enumerations for the worktree domain, shared between the main process and the
 * renderer. Values are stable wire strings: they are persisted in the `settings`
 * key/value table and travel over IPC, so they must not change once shipped.
 */

/**
 * How long an archived worktree lingers on disk before the background reaper
 * force-removes it. `Immediately` reclaims it on the next sweep; the others add a
 * grace period, keyed off the workspace's `archivedAt` timestamp.
 */
export enum ArchiveRetention {
  Immediately = 'immediately',
  OneHour = '1h',
  OneDay = '24h',
  SevenDays = '7d',
}
