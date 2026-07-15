/**
 * Runtime validation for the Project domain. Mirrors `../types/project`. The
 * `projectSchema` has no defaults, so it is annotated `z.ZodType<Project>` to
 * stay in lockstep with the type; the store's `parse()`-and-return sites
 * (`projects.ts`) enforce the output shape.
 */
import { z } from 'zod';
import type {
  AddProjectInput,
  GithubRepo,
  GithubViewer,
  Project,
  UpdateProjectScriptsInput,
} from '../types/project';

export const githubViewerSchema: z.ZodType<GithubViewer> = z.object({
  login: z.string(),
  name: z.string(),
  avatarUrl: z.string(),
});

export const githubRepoSchema: z.ZodType<GithubRepo> = z.object({
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  cloneUrl: z.string(),
  description: z.string().nullable(),
  private: z.boolean(),
  defaultBranch: z.string(),
  updatedAt: z.string(),
});

export const projectSchema: z.ZodType<Project> = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  fullName: z.string(),
  cloneUrl: z.string(),
  localPath: z.string(),
  defaultBranch: z.string(),
  private: z.boolean(),
  setupScript: z.string().nullable(),
  runScript: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const addProjectInputSchema: z.ZodType<AddProjectInput> = z.object({
  fullName: z.string(),
  cloneUrl: z.string(),
  defaultBranch: z.string(),
  private: z.boolean(),
});

export const updateProjectScriptsInputSchema: z.ZodType<UpdateProjectScriptsInput> = z.object({
  projectId: z.string(),
  setupScript: z.string().nullable(),
  runScript: z.string().nullable(),
});
