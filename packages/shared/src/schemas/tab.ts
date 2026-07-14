/**
 * Runtime validation for the Tab domain. Mirrors `../types/tab`. Like the
 * workspace schema it applies zod `.default()`s (so rows/callers may omit a few
 * fields), so it is left unannotated and kept in lockstep with the type by hand;
 * the store's `parse()`-and-return sites (`tabs.ts`) enforce the output shape.
 */
import { z } from 'zod';
import { ClaudeSessionState, PermissionMode } from '../enums/claude';
import { TabKind } from '../enums/tab';
import { claudeSessionStateSchema, reasoningEffortSchema } from './claude';

export const tabSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  // Legacy rows predate the kind discriminator, so default them to chat tabs.
  kind: z.nativeEnum(TabKind).default(TabKind.Chat),
  filePath: z.string().nullable().default(null),
  claudeState: claudeSessionStateSchema.default(ClaudeSessionState.Idle),
  claudeSessionId: z.string().nullable().default(null),
  // Per-tab Claude session config (null = inherit the CLI/SDK default).
  model: z.string().nullable().default(null),
  effort: reasoningEffortSchema.nullable().default(null),
  permissionMode: z.nativeEnum(PermissionMode).default(PermissionMode.Default),
  position: z.number().int(),
  createdAt: z.string().datetime(),
});

export const createTabInputSchema = z.object({
  workspaceId: z.string(),
  title: z.string().optional(),
  kind: z.nativeEnum(TabKind).optional(),
  filePath: z.string().optional(),
});
