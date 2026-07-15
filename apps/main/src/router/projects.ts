/**
 * Projects control plane — bring GitHub repositories into FlowState. `listRepos`
 * reads the linked account; `add` clones a repo, persists it, and makes it the
 * active working folder so it shows up in the sidebar. The GitHub + git work
 * lives in GithubService; persistence in the project store.
 */
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { TRPCError } from '@trpc/server';
import { BrowserWindow, dialog } from 'electron';
import {
  DEFAULT_WORKSPACE_ID,
  addProjectInputSchema,
  updateProjectScriptsInputSchema,
  type Project,
} from '@flowstate/shared';
import { z } from 'zod';
import { isManagedClone } from '../lib/constants/project';
import { WORKTREES_DIR_SUFFIX } from '../lib/constants/worktree';
import {
  deleteProject,
  getProject,
  listProjects,
  listWorkspacesByProject,
  setProjectScripts,
  upsertProject,
} from '../store';
import { teardownWorkspace } from '../services/archive';
import { claudeService } from '../services/claude';
import { githubService } from '../services/github';
import { publicProcedure, router } from '../trpc';

export const projectsRouter = router({
  /** The linked GitHub account's login + avatar (sidebar avatar fallback). */
  viewer: publicProcedure.query(() => githubService.viewer()),

  /** Repositories on the linked GitHub account (candidates to add). */
  listRepos: publicProcedure.query(() => githubService.listRepos()),

  /** Projects already cloned into FlowState. */
  list: publicProcedure.query(() => listProjects()),

  /** Make an existing project the active working folder. */
  open: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }): Project => {
    const project = getProject(input.id);
    if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });
    claudeService.setCwd(DEFAULT_WORKSPACE_ID, project.localPath);
    return project;
  }),

  /**
   * Bring in a folder from the local filesystem via a native picker. Returns the
   * persisted project, or null if the user cancelled. A folder that's already a
   * project is reused rather than duplicated.
   */
  addLocal: publicProcedure.mutation(async (): Promise<Project | null> => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Choose a project folder',
          properties: ['openDirectory'],
        })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    const localPath = result.canceled ? null : (result.filePaths[0] ?? null);
    if (!localPath) return null;

    const existing = listProjects().find((p) => p.localPath === localPath);
    const meta = await githubService.describeLocal(localPath);
    const project = upsertProject({
      id: existing?.id ?? randomUUID(),
      name: meta.name,
      owner: meta.owner,
      fullName: meta.fullName,
      cloneUrl: meta.cloneUrl,
      localPath,
      defaultBranch: meta.defaultBranch,
      private: existing?.private ?? false,
      setupScript: existing?.setupScript ?? null,
      runScript: existing?.runScript ?? null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });

    claudeService.setCwd(DEFAULT_WORKSPACE_ID, project.localPath);
    return project;
  }),

  /** Clone a repo, persist it, and make it the active working folder. */
  add: publicProcedure
    .input(addProjectInputSchema)
    .mutation(async ({ input }): Promise<Project> => {
      let clone: { localPath: string; defaultBranch: string };
      try {
        clone = await githubService.cloneRepo(input);
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Failed to clone repository.',
        });
      }

      const [owner, name] = input.fullName.split('/');
      const project = upsertProject({
        id: randomUUID(),
        name: name ?? input.fullName,
        owner: owner ?? '',
        fullName: input.fullName,
        cloneUrl: input.cloneUrl,
        localPath: clone.localPath,
        defaultBranch: clone.defaultBranch,
        private: input.private,
        setupScript: null,
        runScript: null,
        createdAt: new Date().toISOString(),
      });

      // Make the freshly cloned repo the active project working folder.
      claudeService.setCwd(DEFAULT_WORKSPACE_ID, project.localPath);

      return project;
    }),

  /**
   * Remove a project from FlowState: tear down every worktree, delete its clone
   * folder from disk (only for FlowState-managed clones — never a folder the user
   * brought in from elsewhere), then delete its row (cascading workspaces + pins).
   */
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }): Promise<void> => {
      const project = getProject(input.id);
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });

      // Tear down each worktree first (force — the whole project is going away).
      for (const ws of listWorkspacesByProject(project.id)) {
        await teardownWorkspace(ws, true);
      }

      // Only delete from disk when it's a clone FlowState created and manages.
      if (isManagedClone(project.localPath)) {
        await rm(project.localPath, { recursive: true, force: true });
        // The sibling `<repo>-worktrees/` dir is now empty — clean it up too.
        const worktreesDir = join(
          dirname(project.localPath),
          `${basename(project.localPath)}${WORKTREES_DIR_SUFFIX}`,
        );
        await rm(worktreesDir, { recursive: true, force: true }).catch(() => {});
      }

      deleteProject(project.id);
    }),

  /** Set a project's Setup/Run scripts (shared by every worktree of the project). */
  setScripts: publicProcedure
    .input(updateProjectScriptsInputSchema)
    .mutation(({ input }): Project => {
      const project = setProjectScripts(input.projectId, {
        setupScript: input.setupScript,
        runScript: input.runScript,
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });
      return project;
    }),
});
