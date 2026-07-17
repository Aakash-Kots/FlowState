/**
 * Runtime validation for the analytics read-model. `analyticsSummaryInputSchema`
 * validates the range on the way in; `analyticsSummarySchema` validates the
 * computed aggregates on the way out of the router.
 */
import { z } from 'zod';
import { AnalyticsRange } from '../enums/analytics';
import type {
  AnalyticsSummary,
  AnalyticsTotals,
  CommitDayPoint,
  CommitStats,
  LifecycleStats,
  TerminalRunStats,
  UsageDayPoint,
  UsageModelStat,
  UsageWorkspaceStat,
} from '../types/analytics';

export const analyticsSummaryInputSchema = z.object({
  range: z.nativeEnum(AnalyticsRange),
});

const totalsSchema: z.ZodType<AnalyticsTotals> = z.object({
  costUsd: z.number(),
  turns: z.number(),
  sessions: z.number(),
  errors: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheCreationTokens: z.number(),
});

const usageDayPointSchema: z.ZodType<UsageDayPoint> = z.object({
  day: z.string(),
  costUsd: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheCreationTokens: z.number(),
  turns: z.number(),
  errors: z.number(),
});

const usageModelStatSchema: z.ZodType<UsageModelStat> = z.object({
  model: z.string(),
  costUsd: z.number(),
  tokens: z.number(),
  turns: z.number(),
});

const usageWorkspaceStatSchema: z.ZodType<UsageWorkspaceStat> = z.object({
  workspaceId: z.string(),
  name: z.string(),
  branch: z.string().nullable(),
  project: z.string().nullable(),
  costUsd: z.number(),
  turns: z.number(),
});

const lifecycleStatsSchema: z.ZodType<LifecycleStats> = z.object({
  worktreesActive: z.number(),
  worktreesArchived: z.number(),
  worktreesTotal: z.number(),
  projects: z.number(),
  avgWorktreeLifespanMs: z.number().nullable(),
});

const commitDayPointSchema: z.ZodType<CommitDayPoint> = z.object({
  day: z.string(),
  commits: z.number(),
  insertions: z.number(),
  deletions: z.number(),
});

const commitStatsSchema: z.ZodType<CommitStats> = z.object({
  commits: z.number(),
  insertions: z.number(),
  deletions: z.number(),
});

const terminalRunStatsSchema: z.ZodType<TerminalRunStats> = z.object({
  runs: z.number(),
  failures: z.number(),
  avgDurationMs: z.number().nullable(),
});

export const analyticsSummarySchema: z.ZodType<AnalyticsSummary> = z.object({
  totals: totalsSchema,
  usageByDay: z.array(usageDayPointSchema),
  usageByModel: z.array(usageModelStatSchema),
  usageByWorkspace: z.array(usageWorkspaceStatSchema),
  lifecycle: lifecycleStatsSchema,
  commitsByDay: z.array(commitDayPointSchema),
  commitStats: commitStatsSchema,
  terminalRunStats: terminalRunStatsSchema,
});
