/**
 * Runtime validation for the Workspace domain. Mirrors `../types/workspace`.
 * These schemas apply zod `.default()`s (so callers/rows may omit a few fields),
 * which makes the parse input a partial of the type; they are therefore left
 * unannotated and kept in lockstep with the type by hand — the store's
 * `parse()`-and-return sites (`workspaces.ts`) enforce the output shape.
 */
import { z } from 'zod';
import { ClaudeSessionState, PermissionMode } from '../enums/claude';
import type { RecentWorkspaceEntry } from '../types/workspace';
import { claudeSessionStateSchema } from './claude';
import { linearIssueRefSchema } from './linear';

export const workspaceSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable().default(null),
  name: z.string(),
  repoRoot: z.string(),
  worktreePath: z.string(),
  branch: z.string(),
  baseRef: z.string().nullable().default(null),
  linearIssue: linearIssueRefSchema.nullable().default(null),
  claudeState: claudeSessionStateSchema.default(ClaudeSessionState.Idle),
  claudeSessionId: z.string().nullable().default(null),
  archivedAt: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
});

export const recentWorkspaceEntrySchema: z.ZodType<RecentWorkspaceEntry> = z.object({
  workspaceId: z.string(),
  tabId: z.string().nullable(),
});

export const recentWorkspacesSchema = z.array(recentWorkspaceEntrySchema);

export const renameWorktreeInputSchema = z.object({
  workspaceId: z.string(),
  name: z.string().trim().min(1),
});

export const createWorkspaceInputSchema = z.object({
  repoRoot: z.string(),
  branch: z.string(),
  baseRef: z.string().default('HEAD'),
  linearIssueId: z.string().optional(),
});

export const createWorktreeInputSchema = z.object({
  projectId: z.string(),
  baseRef: z.string().optional(),
  initialPrompt: z.string().optional(),
  permissionMode: z.nativeEnum(PermissionMode).optional(),
  /** Linear issue to link to the new worktree (optional). */
  linearIssue: linearIssueRefSchema.nullable().optional(),
  /** Explicit branch name (e.g. from the linked issue), overriding the random one. */
  branch: z.string().trim().min(1).optional(),
});
