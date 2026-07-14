/**
 * Persistence for the Claude usage ledger (`usage_events`) — an append-only log
 * of each finalized turn's API-equivalent cost and token usage. Written once per
 * `result` message; read back as aggregates by the (future) spend/savings UI.
 * Rows are denormalized on purpose (no FK to workspaces/tabs), so the ledger
 * outlives the workspaces and tabs it references.
 */
import {
  type NewUsageEvent,
  type UsageByDay,
  type UsageTotals,
  newUsageEventSchema,
} from '@flowstate/shared';
import { sql } from 'drizzle-orm';
import { getDb } from './db';
import { usageEvents } from './schema';

/** Append one turn's usage to the ledger. */
export function recordUsageEvent(input: NewUsageEvent): void {
  const event = newUsageEventSchema.parse(input);
  getDb().insert(usageEvents).values(event).run();
}

/** Total spend and turn count across the whole ledger. */
export function getUsageTotals(): UsageTotals {
  const row = getDb()
    .select({
      costUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(usageEvents)
    .get();
  return { costUsd: row?.costUsd ?? 0, count: row?.count ?? 0 };
}

/** Spend grouped by local calendar day, oldest first — the activity-graph feed. */
export function getUsageByDay(): UsageByDay[] {
  return getDb()
    .select({
      day: sql<string>`date(${usageEvents.createdAt}, 'localtime')`,
      costUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)`,
    })
    .from(usageEvents)
    .groupBy(sql`date(${usageEvents.createdAt}, 'localtime')`)
    .orderBy(sql`date(${usageEvents.createdAt}, 'localtime')`)
    .all();
}
