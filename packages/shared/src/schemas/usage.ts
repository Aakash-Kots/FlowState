/**
 * Runtime validation for the Claude usage ledger. Mirrors `../types/usage`;
 * `usageEventSchema` validates rows read back out of SQLite before they leave
 * the store accessor.
 */
import { z } from 'zod';
import type { NewUsageEvent, UsageEvent } from '../types/usage';

export const usageEventSchema: z.ZodType<UsageEvent> = z.object({
  id: z.number(),
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
