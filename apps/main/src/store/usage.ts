/**
 * Persistence for the Claude usage ledger (`usage_events`) — an append-only log
 * of each finalized turn's API-equivalent cost and token usage. Written once per
 * `result` message; read back as aggregates by the (future) spend/savings UI.
 * Rows are denormalized on purpose (no FK to workspaces/tabs), so the ledger
 * outlives the workspaces and tabs it references.
 */
import {
  type AnalyticsTotals,
  type NewUsageEvent,
  type UsageByDay,
  type UsageDayPoint,
  type UsageModelStat,
  type UsageTotals,
  type UsageWorkspaceStat,
  newUsageEventSchema,
} from '@flowstate/shared';
import { gte, sql } from 'drizzle-orm';
import { getDb } from './db';
import { usageEvents, workspaces } from './schema';

/////////////
// Helpers //
/////////////

/** `created_at >= since` when a cutoff is set, else no time filter. */
function sinceFilter(since: string | null) {
  return since ? gte(usageEvents.createdAt, since) : undefined;
}

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

//////////////////////
// Analytics reads   //
//////////////////////

/** Headline usage totals across the range (cost, turns, distinct sessions, tokens, errors). */
export function getUsageTotalsRange(since: string | null): AnalyticsTotals {
  const row = getDb()
    .select({
      costUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)`,
      turns: sql<number>`count(*)`,
      sessions: sql<number>`count(distinct ${usageEvents.sessionId})`,
      errors: sql<number>`coalesce(sum(${usageEvents.isError}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)`,
      cacheReadTokens: sql<number>`coalesce(sum(${usageEvents.cacheReadTokens}), 0)`,
      cacheCreationTokens: sql<number>`coalesce(sum(${usageEvents.cacheCreationTokens}), 0)`,
    })
    .from(usageEvents)
    .where(sinceFilter(since))
    .get();
  return {
    costUsd: row?.costUsd ?? 0,
    turns: row?.turns ?? 0,
    sessions: row?.sessions ?? 0,
    errors: row?.errors ?? 0,
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
    cacheReadTokens: row?.cacheReadTokens ?? 0,
    cacheCreationTokens: row?.cacheCreationTokens ?? 0,
  };
}

/** Cost + tokens + turns + errors per local calendar day, oldest first. */
export function getUsageSeriesByDay(since: string | null): UsageDayPoint[] {
  return getDb()
    .select({
      day: sql<string>`date(${usageEvents.createdAt}, 'localtime')`,
      costUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)`,
      cacheReadTokens: sql<number>`coalesce(sum(${usageEvents.cacheReadTokens}), 0)`,
      cacheCreationTokens: sql<number>`coalesce(sum(${usageEvents.cacheCreationTokens}), 0)`,
      turns: sql<number>`count(*)`,
      errors: sql<number>`coalesce(sum(${usageEvents.isError}), 0)`,
    })
    .from(usageEvents)
    .where(sinceFilter(since))
    .groupBy(sql`date(${usageEvents.createdAt}, 'localtime')`)
    .orderBy(sql`date(${usageEvents.createdAt}, 'localtime')`)
    .all();
}

/** Cost + tokens + turns per model, highest spend first. */
export function getUsageByModel(since: string | null): UsageModelStat[] {
  return getDb()
    .select({
      model: sql<string>`coalesce(${usageEvents.model}, 'unknown')`,
      costUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)`,
      tokens: sql<number>`coalesce(sum(coalesce(${usageEvents.inputTokens}, 0) + coalesce(${usageEvents.outputTokens}, 0) + coalesce(${usageEvents.cacheReadTokens}, 0) + coalesce(${usageEvents.cacheCreationTokens}, 0)), 0)`,
      turns: sql<number>`count(*)`,
    })
    .from(usageEvents)
    .where(sinceFilter(since))
    .groupBy(sql`coalesce(${usageEvents.model}, 'unknown')`)
    .orderBy(sql`coalesce(sum(${usageEvents.costUsd}), 0) desc`)
    .all();
}

/** Cost + turns per workspace (name resolved when the row still exists), top spenders first. */
export function getUsageByWorkspace(since: string | null, limit = 12): UsageWorkspaceStat[] {
  return getDb()
    .select({
      workspaceId: usageEvents.workspaceId,
      name: sql<string>`coalesce(${workspaces.name}, 'Deleted workspace')`,
      costUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)`,
      turns: sql<number>`count(*)`,
    })
    .from(usageEvents)
    .leftJoin(workspaces, sql`${workspaces.id} = ${usageEvents.workspaceId}`)
    .where(sinceFilter(since))
    .groupBy(usageEvents.workspaceId)
    .orderBy(sql`coalesce(sum(${usageEvents.costUsd}), 0) desc`)
    .limit(limit)
    .all();
}
