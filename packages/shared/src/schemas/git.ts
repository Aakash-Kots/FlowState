/**
 * Runtime validation for the git domain — the `gitRouter` input boundary.
 * Every git procedure is keyed by `workspaceId`; the main side resolves the
 * worktree path from the workspace store. Mirrors the inputs in `../types/git`.
 */
import { z } from 'zod';
import type { CommitInput, CreatePrInput } from '../types/git';

/** A procedure that acts on a whole worktree (status, fetch, pull, push). */
export const gitWorkspaceInputSchema = z.object({ workspaceId: z.string() });

/** Read a single file's diff, from the index (`staged`) or the working tree. */
export const gitDiffFileInputSchema = z.object({
  workspaceId: z.string(),
  path: z.string(),
  staged: z.boolean().default(false),
});

/** Stage/unstage/discard a set of paths. */
export const gitPathsInputSchema = z.object({
  workspaceId: z.string(),
  paths: z.array(z.string()).min(1),
});

export const commitInputSchema: z.ZodType<CommitInput> = z.object({
  workspaceId: z.string(),
  summary: z.string().min(1),
  description: z.string().optional(),
});

export const createPrInputSchema: z.ZodType<CreatePrInput> = z.object({
  workspaceId: z.string(),
  title: z.string().min(1),
  body: z.string().optional(),
});
