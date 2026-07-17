/**
 * The analytics read-model — composes the usage ledger, the activity ledger, and
 * entity lifecycle timestamps into a single {@link AnalyticsSummary} per selected
 * {@link AnalyticsRange}. The router validates the result at its boundary.
 */
import {
  AnalyticsRange,
  type AnalyticsSummary,
  type LifecycleStats,
} from '@flowstate/shared';
import { sql } from 'drizzle-orm';
import { getTerminalRunStats } from './activity';
import { getDb } from './db';
import { projects, workspaces } from './schema';
import {
  getUsageByModel,
  getUsageByWorkspace,
  getUsageSeriesByDay,
  getUsageTotalsRange,
} from './usage';

/////////////
// Constants //
/////////////

const DAY_MS = 24 * 60 * 60 * 1000;

/////////////
// Helpers //
/////////////

/** The ISO cutoff for a range, or null for all-time. */
export function rangeCutoff(range: AnalyticsRange): string | null {
  switch (range) {
    case AnalyticsRange.Last7Days:
      return new Date(Date.now() - 7 * DAY_MS).toISOString();
    case AnalyticsRange.Last30Days:
      return new Date(Date.now() - 30 * DAY_MS).toISOString();
    case AnalyticsRange.All:
      return null;
  }
}

//////////////
// Accessors //
//////////////

/** Worktree/project lifecycle counts (all-time — lifecycle isn't range-scoped). */
export function getLifecycleStats(): LifecycleStats {
  const ws = getDb()
    .select({
      total: sql<number>`count(*)`,
      archived: sql<number>`coalesce(sum(case when ${workspaces.archivedAt} is not null then 1 else 0 end), 0)`,
      avgLifespan: sql<
        number | null
      >`avg(case when ${workspaces.archivedAt} is not null then (julianday(${workspaces.archivedAt}) - julianday(${workspaces.createdAt})) * ${DAY_MS} else null end)`,
    })
    .from(workspaces)
    .get();
  const projectRow = getDb().select({ count: sql<number>`count(*)` }).from(projects).get();

  const total = ws?.total ?? 0;
  const archived = ws?.archived ?? 0;
  return {
    worktreesActive: total - archived,
    worktreesArchived: archived,
    worktreesTotal: total,
    projects: projectRow?.count ?? 0,
    avgWorktreeLifespanMs: ws?.avgLifespan ?? null,
  };
}

/**
 * The DB-derived slice of the analytics summary for one range. The commit
 * aggregates (`commitsByDay` / `commitStats`) come from live `git log` and are
 * composed on top of this at the router — see {@link getCommitHistoryStats}.
 */
export function getAnalyticsSummary(
  range: AnalyticsRange,
): Omit<AnalyticsSummary, 'commitsByDay' | 'commitStats'> {
  const since = rangeCutoff(range);
  return {
    totals: getUsageTotalsRange(since),
    usageByDay: getUsageSeriesByDay(since),
    usageByModel: getUsageByModel(since),
    usageByWorkspace: getUsageByWorkspace(since),
    lifecycle: getLifecycleStats(),
    terminalRunStats: getTerminalRunStats(since),
  };
}
