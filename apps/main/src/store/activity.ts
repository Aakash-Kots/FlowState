/**
 * Persistence for the activity ledger (`activity_events`) — an append-only log
 * of meaningful user actions (commits, finished Setup/Run scripts, Linear state
 * changes, Spotify plays), read back by the analytics page as time-series
 * aggregates. Rows are denormalized on purpose (no FK), so the ledger outlives
 * the workspaces and projects it references.
 *
 * Aggregate readers take a `since` ISO cutoff (or null for "all time"); the
 * caller derives it from the selected {@link AnalyticsRange}.
 */
import {
  ActivityType,
  type NewActivityEvent,
  type TerminalRunStats,
  newActivityEventSchema,
} from '@flowstate/shared';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb } from './db';
import { activityEvents } from './schema';

/////////////
// Helpers //
/////////////

/** `created_at >= since` when a cutoff is set, else no time filter. */
function sinceFilter(since: string | null) {
  return since ? gte(activityEvents.createdAt, since) : undefined;
}

//////////////
// Accessors //
//////////////

/** Append one action to the ledger. Best-effort — callers wrap this so a logging
 * failure never breaks the action it describes. */
export function recordActivityEvent(input: NewActivityEvent): void {
  const event = newActivityEventSchema.parse(input);
  getDb()
    .insert(activityEvents)
    .values({
      type: event.data.type,
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      data: JSON.stringify(event.data),
      createdAt: event.createdAt,
    })
    .run();
}

/** Delete activity rows older than `cutoff` (ISO). Returns the number pruned. */
export function pruneActivityEventsBefore(cutoff: string): number {
  return getDb().delete(activityEvents).where(lt(activityEvents.createdAt, cutoff)).run().changes;
}

/** Tracked Setup/Run terminal-script totals across the range. */
export function getTerminalRunStats(since: string | null): TerminalRunStats {
  const row = getDb()
    .select({
      runs: sql<number>`count(*)`,
      failures: sql<number>`coalesce(sum(case when json_extract(${activityEvents.data}, '$.exitCode') != 0 then 1 else 0 end), 0)`,
      avgDurationMs: sql<number | null>`avg(json_extract(${activityEvents.data}, '$.durationMs'))`,
    })
    .from(activityEvents)
    .where(and(eq(activityEvents.type, ActivityType.TerminalRun), sinceFilter(since)))
    .get();
  return {
    runs: row?.runs ?? 0,
    failures: row?.failures ?? 0,
    avgDurationMs: row?.avgDurationMs ?? null,
  };
}
