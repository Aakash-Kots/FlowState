/**
 * Runtime validation for the files domain — the `filesRouter` input boundary.
 * Every procedure is keyed by `workspaceId`; the main side resolves the worktree
 * path from the workspace store and confines `path` to it. Mirrors the inputs in
 * `../types/files`.
 */
import { z } from 'zod';
import type {
  FileReadInput,
  FileWriteInput,
  FilesListForProjectInput,
  FilesListInput,
  FilesReadDirInput,
} from '../types/files';

/** List every file in a workspace's worktree. */
export const filesListInputSchema: z.ZodType<FilesListInput> = z.object({
  workspaceId: z.string(),
});

/** List every file in a project's local clone (create-worktree mention menu). */
export const filesListForProjectInputSchema: z.ZodType<FilesListForProjectInput> = z.object({
  projectId: z.string(),
});

/** Read one directory level of a worktree (`dir` empty = root, so no `.min(1)`). */
export const filesReadDirInputSchema: z.ZodType<FilesReadDirInput> = z.object({
  workspaceId: z.string(),
  dir: z.string(),
});

/** Read a single worktree-relative file. */
export const fileReadInputSchema: z.ZodType<FileReadInput> = z.object({
  workspaceId: z.string(),
  path: z.string().min(1),
});

/** Overwrite a single worktree-relative file. */
export const fileWriteInputSchema: z.ZodType<FileWriteInput> = z.object({
  workspaceId: z.string(),
  path: z.string().min(1),
  content: z.string(),
});
