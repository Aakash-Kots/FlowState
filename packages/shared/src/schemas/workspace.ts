/**
 * Runtime validation for the Workspace domain. Mirrors `../types/workspace`.
 * These schemas apply zod `.default()`s (so callers/rows may omit a few fields),
 * which makes the parse input a partial of the type; they are therefore left
 * unannotated and kept in lockstep with the type by hand — the store's
 * `parse()`-and-return sites (`workspaces.ts`) enforce the output shape.
 */
import { z } from 'zod';
import { ClaudeSessionState } from '../enums/claude';
import { claudeSessionStateSchema } from './claude';
import { linearIssueRefSchema } from './linear';

export const workspaceSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable().default(null),
  name: z.string(),
  repoRoot: z.string(),
  worktreePath: z.string(),
  branch: z.string(),
  linearIssue: linearIssueRefSchema.nullable().default(null),
  claudeState: claudeSessionStateSchema.default(ClaudeSessionState.Idle),
  claudeSessionId: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
});

export const createWorkspaceInputSchema = z.object({
  repoRoot: z.string(),
  branch: z.string(),
  baseRef: z.string().default('HEAD'),
  linearIssueId: z.string().optional(),
});

export const createWorktreeInputSchema = z.object({
  projectId: z.string(),
  branch: z.string().min(1),
  baseRef: z.string().optional(),
  initialPrompt: z.string().optional(),
});
