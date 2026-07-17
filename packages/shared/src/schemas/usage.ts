/**
 * Runtime validation for the Claude usage ledger. Mirrors `../types/usage`;
 * `usageEventSchema` validates rows read back out of SQLite before they leave
 * the store accessor.
 */
import { z } from 'zod';
import type {
  NewUsageEvent,
  UsageAttribution,
  UsageBehavior,
  UsageBreakdown,
  UsageEvent,
  UsageLimits,
  UsageModelWindow,
  UsageWindow,
  UsageWindowBreakdown,
} from '../types/usage';

export const usageEventSchema: z.ZodType<UsageEvent> = z.object({
  id: z.number(),
  workspaceId: z.string(),
  tabId: z.string().nullable(),
  workspaceName: z.string().nullable(),
  branch: z.string().nullable(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  sessionId: z.string(),
  model: z.string().nullable(),
  costUsd: z.number(),
  durationMs: z.number().nullable(),
  numTurns: z.number().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  cacheReadTokens: z.number().nullable(),
  cacheCreationTokens: z.number().nullable(),
  isError: z.boolean(),
  createdAt: z.string().datetime(),
});

export const newUsageEventSchema: z.ZodType<NewUsageEvent> = z.object({
  workspaceId: z.string(),
  tabId: z.string().nullable(),
  sessionId: z.string(),
  model: z.string().nullable(),
  costUsd: z.number(),
  durationMs: z.number().nullable(),
  numTurns: z.number().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  cacheReadTokens: z.number().nullable(),
  cacheCreationTokens: z.number().nullable(),
  isError: z.boolean(),
  createdAt: z.string().datetime(),
});

const usageWindowSchema: z.ZodType<UsageWindow> = z.object({
  utilization: z.number().nullable(),
  resetsAt: z.string().nullable(),
});

const usageModelWindowSchema: z.ZodType<UsageModelWindow> = z.object({
  displayName: z.string(),
  utilization: z.number().nullable(),
  resetsAt: z.string().nullable(),
});

const usageBehaviorSchema: z.ZodType<UsageBehavior> = z.object({
  key: z.string(),
  pct: z.number(),
  count: z.number(),
});

const usageAttributionSchema: z.ZodType<UsageAttribution> = z.object({
  name: z.string(),
  pct: z.number(),
});

const usageWindowBreakdownSchema: z.ZodType<UsageWindowBreakdown> = z.object({
  requestCount: z.number(),
  sessionCount: z.number(),
  behaviors: z.array(usageBehaviorSchema),
  skills: z.array(usageAttributionSchema),
  subagents: z.array(usageAttributionSchema),
  mcpServers: z.array(usageAttributionSchema),
});

const usageBreakdownSchema: z.ZodType<UsageBreakdown> = z.object({
  day: usageWindowBreakdownSchema,
  week: usageWindowBreakdownSchema,
});

/** Validates the normalized usage snapshot at the router boundary. */
export const usageLimitsSchema: z.ZodType<UsageLimits> = z.object({
  subscriptionType: z.string().nullable(),
  session: usageWindowSchema.nullable(),
  weekly: usageWindowSchema.nullable(),
  models: z.array(usageModelWindowSchema),
  breakdown: usageBreakdownSchema.nullable(),
});
