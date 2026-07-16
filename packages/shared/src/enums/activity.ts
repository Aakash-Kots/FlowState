/**
 * The kinds of activity FlowState records into the `activity_events` ledger —
 * one durable, time-stamped row per meaningful action, mined by the analytics
 * page. Values are byte-stable: they're persisted in SQLite's `type` column and
 * used as the discriminant of the activity payload union.
 */

///////////
// Enums //
///////////

export enum ActivityType {
  GitCommit = 'git_commit',
  TerminalRun = 'terminal_run',
  LinearTransition = 'linear_transition',
  SpotifyPlay = 'spotify_play',
}
