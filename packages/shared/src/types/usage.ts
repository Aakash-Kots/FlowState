/**
 * Claude usage-ledger types shared between the main process (which records a row
 * per finalized `result` turn) and the future analytics UI (which reads
 * aggregates back). Runtime validation lives in `../schemas/usage`.
 */

/**
 * One recorded Claude turn: its API-equivalent cost and token usage. On a
 * subscription the cost is money not spent, so summing these rows yields the
 * savings/spend graph. `workspaceId`/`tabId` are denormalized (the owning rows
 * may since have been deleted); `tabId` is null once its tab is gone.
 * `workspaceName`/`branch`/`projectId`/`projectName` are an identity snapshot
 * taken at write time so per-workspace spend stays labelled after the workspace
 * is hard-deleted; each is null when it couldn't be resolved when recorded.
 */
export type UsageEvent = {
  id: number;
  workspaceId: string;
  tabId: string | null;
  workspaceName: string | null;
  branch: string | null;
  projectId: string | null;
  projectName: string | null;
  sessionId: string;
  model: string | null;
  costUsd: number;
  durationMs: number | null;
  numTurns: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  isError: boolean;
  createdAt: string;
};

/**
 * A usage row to record — the persisted shape minus the autoincrement `id` and
 * the identity snapshot, which the store derives from `workspaceId` at insert.
 */
export type NewUsageEvent = Omit<
  UsageEvent,
  'id' | 'workspaceName' | 'branch' | 'projectId' | 'projectName'
>;

/** Running totals across the ledger. */
export type UsageTotals = {
  costUsd: number;
  count: number;
};

/** One day's accumulated cost, keyed by `YYYY-MM-DD` (local date). */
export type UsageByDay = {
  day: string;
  costUsd: number;
};

/**
 * Claude subscription usage limits — the live data the `/usage` command renders,
 * read from the Agent SDK and surfaced in the header widget. Distinct from the
 * cost ledger above: these are plan rate-limit *utilization* windows, not spend.
 */

/**
 * One rate-limit window. `utilization` is a 0-100 percentage of the window
 * consumed; `resetsAt` is an ISO 8601 timestamp. Either can be null when the
 * SDK has no value yet.
 */
export type UsageWindow = {
  utilization: number | null;
  resetsAt: string | null;
};

/** A per-model weekly window (e.g. Fable), labelled by the SDK's `display_name`. */
export type UsageModelWindow = UsageWindow & {
  displayName: string;
};

/**
 * One behavioral characteristic contributing to usage (e.g. `subagent_heavy`,
 * `long_context`). `key` is the raw SDK identifier; `pct` is its share of the
 * weighted local usage (0-100). Categories overlap, so they don't sum to 100.
 */
export type UsageBehavior = {
  key: string;
  pct: number;
  count: number;
};

/** A named contributor (skill / subagent / MCP server) and its usage share, 0-100. */
export type UsageAttribution = {
  name: string;
  pct: number;
};

/**
 * "Where usage is going" for one time window — from a local-transcript scan on
 * this machine (approximate; excludes other devices and claude.ai), mirroring
 * the `/usage` dialog's contribution breakdown.
 */
export type UsageWindowBreakdown = {
  requestCount: number;
  sessionCount: number;
  behaviors: UsageBehavior[];
  skills: UsageAttribution[];
  subagents: UsageAttribution[];
  mcpServers: UsageAttribution[];
};

/** The 24h + 7d contribution breakdown; null when unavailable / scan failed. */
export type UsageBreakdown = {
  day: UsageWindowBreakdown;
  week: UsageWindowBreakdown;
};

/**
 * Normalized subscription usage snapshot for the header widget. `session` is the
 * 5-hour window, `weekly` the all-models 7-day window, and `models` the per-model
 * weekly windows (Fable lives here). `subscriptionType` is null for API-key /
 * third-party sessions where plan limits don't apply — the widget hides then.
 */
export type UsageLimits = {
  subscriptionType: string | null;
  session: UsageWindow | null;
  weekly: UsageWindow | null;
  models: UsageModelWindow[];
  /** Contribution breakdown for the hover detail; null when the SDK omits it. */
  breakdown: UsageBreakdown | null;
};
