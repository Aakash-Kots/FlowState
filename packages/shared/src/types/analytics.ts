/**
 * The read-model the analytics page renders — aggregates derived from the usage
 * ledger (`usage_events`), the activity ledger (`activity_events`), and entity
 * lifecycle timestamps. The main process computes these in `store/analytics.ts`
 * and returns one {@link AnalyticsSummary} per selected {@link AnalyticsRange}.
 * Runtime validation lives in `../schemas/analytics`.
 */

///////////
// Types //
///////////

/** Headline Claude-usage totals for the KPI tiles. */
export type AnalyticsTotals = {
  costUsd: number;
  turns: number;
  sessions: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

/** One local calendar day of Claude usage, keyed `YYYY-MM-DD`, oldest first. */
export type UsageDayPoint = {
  day: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  turns: number;
  errors: number;
};

/** Spend + token + turn totals for one model. */
export type UsageModelStat = {
  model: string;
  costUsd: number;
  tokens: number;
  turns: number;
};

/**
 * Spend + turn totals for one workspace. `name`/`branch`/`project` resolve from
 * the live row when it exists, else from the ledger's write-time snapshot; each
 * is null (or "Deleted workspace" for `name`) when neither is available.
 */
export type UsageWorkspaceStat = {
  workspaceId: string;
  name: string;
  branch: string | null;
  project: string | null;
  costUsd: number;
  turns: number;
};

/** Worktree/project lifecycle counts derived from `created_at`/`archived_at`. */
export type LifecycleStats = {
  worktreesActive: number;
  worktreesArchived: number;
  worktreesTotal: number;
  projects: number;
  /** Mean time an archived worktree lived (created → archived), or null if none. */
  avgWorktreeLifespanMs: number | null;
};

/** One local calendar day of commit activity, oldest first. */
export type CommitDayPoint = {
  day: string;
  commits: number;
  insertions: number;
  deletions: number;
};

/** Commit totals across the range. */
export type CommitStats = {
  commits: number;
  insertions: number;
  deletions: number;
};

/** Tracked Setup/Run terminal-script totals across the range. */
export type TerminalRunStats = {
  runs: number;
  failures: number;
  avgDurationMs: number | null;
};

/** The full analytics payload for one range — everything the page needs in one query. */
export type AnalyticsSummary = {
  totals: AnalyticsTotals;
  usageByDay: UsageDayPoint[];
  usageByModel: UsageModelStat[];
  usageByWorkspace: UsageWorkspaceStat[];
  lifecycle: LifecycleStats;
  commitsByDay: CommitDayPoint[];
  commitStats: CommitStats;
  terminalRunStats: TerminalRunStats;
};
