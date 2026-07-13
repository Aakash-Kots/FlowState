/**
 * Worktree control plane — the sub-tabs under a project. `create` cuts a new git
 * worktree on its own branch, links the project's `.env*` files into it, persists
 * a workspace + its first Claude tab, and optionally sends an initial prompt.
 * `list` returns a project's worktrees; `remove` tears one down (guarding against
 * uncommitted changes). Git work lives in WorktreeService, file linking in
 * FileLinkService, persistence in the workspace/tab stores.
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { TRPCError } from '@trpc/server';
import {
  ClaudeSessionState,
  DEFAULT_TAB_TITLE,
  createWorktreeInputSchema,
  type Tab,
  type Workspace,
} from '@flowstate/shared';
import { z } from 'zod';
import {
  deleteWorkspace,
  getProject,
  getWorkspace,
  listTabs,
  listWorkspacesByProject,
  upsertTab,
  upsertWorkspace,
} from '../store';
import { claudeService } from '../services/claude';
import { GitService } from '../services/git';
import { fileLinkService } from '../services/links';
import { worktreeService } from '../services/worktree';
import { makeTab } from './tabs';
import { publicProcedure, router } from '../trpc';

export const worktreeRouter = router({
  /** The worktree-workspaces under a project, most-recent first. */
  list: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) => listWorkspacesByProject(input.projectId)),

  /** Create a worktree (branch + linked env) under a project and seed its first tab. */
  create: publicProcedure
    .input(createWorktreeInputSchema)
    .mutation(async ({ input }): Promise<{ workspace: Workspace; tab: Tab }> => {
      const project = getProject(input.projectId);
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });

      const repoRoot = project.localPath;
      const baseRef = input.baseRef?.trim() || project.defaultBranch;
      const worktreePath = worktreeService.worktreePathFor(repoRoot, input.branch);

      // 1. Create the worktree + branch.
      try {
        await worktreeService.create({ repoRoot, branch: input.branch, baseRef, worktreePath });
      } catch (err) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: err instanceof Error ? err.message : 'Failed to create worktree.',
        });
      }

      try {
        // 2. Link the project's .env* files into the fresh checkout (best-effort).
        const envFiles = await fileLinkService.detectEnvFiles(repoRoot);
        await fileLinkService.linkInto(repoRoot, worktreePath, envFiles);

        // 3. Persist the workspace + seed its first Claude tab.
        const workspace = upsertWorkspace({
          id: randomUUID(),
          projectId: project.id,
          name: input.branch,
          repoRoot,
          worktreePath,
          branch: input.branch,
          linearIssue: null,
          claudeState: ClaudeSessionState.Idle,
          claudeSessionId: null,
          createdAt: new Date().toISOString(),
        });
        const tab = upsertTab(makeTab(workspace.id, DEFAULT_TAB_TITLE, 0));

        // 4. Optionally kick off the first session with the user's prompt.
        const prompt = input.initialPrompt?.trim();
        if (prompt) claudeService.send(tab.id, prompt);

        return { workspace, tab };
      } catch (err) {
        // Roll back the orphaned worktree so a retry with the same branch works.
        await worktreeService.remove({ repoRoot, worktreePath, force: true }).catch(() => {});
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Failed to set up worktree.',
        });
      }
    }),

  /** Remove a worktree-workspace: close its sessions, delete the worktree + rows. */
  remove: publicProcedure
    .input(z.object({ workspaceId: z.string(), force: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const ws = getWorkspace(input.workspaceId);
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found.' });

      if (!input.force && existsSync(ws.worktreePath)) {
        const dirty = await new GitService(ws.worktreePath).isDirty().catch(() => false);
        if (dirty) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'This worktree has uncommitted changes. Commit them or remove with force.',
          });
        }
      }

      for (const tab of listTabs(ws.id)) claudeService.closeSession(tab.id);

      try {
        await worktreeService.remove({
          repoRoot: ws.repoRoot,
          worktreePath: ws.worktreePath,
          force: input.force,
        });
      } catch (err) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: err instanceof Error ? err.message : 'Failed to remove worktree.',
        });
      }

      deleteWorkspace(ws.id); // cascades tabs + transcripts
    }),
});
