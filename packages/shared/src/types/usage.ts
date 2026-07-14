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
 */
export type UsageEvent = {
  id: number;
  workspaceId: string;
  tabId: string | null;
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

/** A usage row to record — the persisted shape minus the autoincrement `id`. */
export type NewUsageEvent = Omit<UsageEvent, 'id'>;

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
