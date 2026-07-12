import { z } from 'zod';

/**
 * A Linear issue reference linked to a workspace. Kept intentionally small —
 * the full issue lives in Linear; FlowState stores just enough to display and
 * link back.
 */
export const linearIssueRefSchema = z.object({
  id: z.string(),
  identifier: z.string(), // e.g. "ENG-142"
  title: z.string(),
  url: z.string().url(),
  stateName: z.string().optional(),
});

/**
 * Lifecycle of a Claude Code session bound to a workspace.
 */
export const claudeSessionStateSchema = z.enum([
  'idle', // no session started
  'running', // agent is actively working
  'waiting', // paused on a permission prompt / user input
  'error', // last run errored
]);

/**
 * A Workspace is FlowState's core unit: one git worktree plus its terminals,
 * Claude Code session, and an optionally linked Linear issue.
 */
export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  repoRoot: z.string(), // the primary repository path
  worktreePath: z.string(), // absolute path of this worktree
  branch: z.string(),
  linearIssue: linearIssueRefSchema.nullable().default(null),
  claudeState: claudeSessionStateSchema.default('idle'),
  claudeSessionId: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
});

/** Input to create a new workspace (worktree + branch). */
export const createWorkspaceInputSchema = z.object({
  repoRoot: z.string(),
  branch: z.string(),
  baseRef: z.string().default('HEAD'),
  linearIssueId: z.string().optional(),
});
