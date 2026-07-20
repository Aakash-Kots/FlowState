/**
 * Worktree control plane — the sub-tabs under a project. `create` cuts a new git
 * worktree on its own branch, links the project's `.env*` files into it, persists
 * a workspace + its first Claude tab, and optionally sends an initial prompt.
 * `list` returns a project's worktrees; `remove` tears one down (guarding against
 * uncommitted changes). Git work lives in WorktreeService, file linking in
 * FileLinkService, persistence in the workspace/tab stores.
 */
import { existsSync } from 'node:fs';
import { TRPCError } from '@trpc/server';
import {
  PrState,
  createWorktreeInputSchema,
  renameWorktreeInputSchema,
  type RecentWorkspaceEntry,
  type Tab,
  type Workspace,
  type WorktreeChange,
} from '@flowstate/shared';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import {
  archiveWorkspace,
  getProject,
  getRecentWorkspaces,
  getTab,
  getWorkspace,
  listTabs,
  listTerminalTabs,
  listWorkspacesByProject,
  rememberRecentWorkspace,
} from '../store';
import { archiveReaperService, teardownWorkspace } from '../services/archive';
import { claudeService } from '../services/claude';
import { GitService } from '../services/git';
import { githubService } from '../services/github';
import { terminalService } from '../services/terminal';
import {
  WorkspaceCreateError,
  createWorkspace,
  type WorkspaceCreateFailure,
} from '../services/workspaceCreate';
import { worktreeService } from '../services/worktree';
import { renameWorktree, worktreeEvents } from '../services/worktreeEvents';
import { publicProcedure, router } from '../trpc';

/////////////
// Helpers //
/////////////

/** Map a workspace-creation failure to the tRPC code the client already expects. */
const CREATE_ERROR_CODES: Record<WorkspaceCreateFailure, TRPCError['code']> = {
  'not-found': 'NOT_FOUND',
  precondition: 'PRECONDITION_FAILED',
  internal: 'INTERNAL_SERVER_ERROR',
};

export const worktreeRouter = router({
  /** The worktree-workspaces under a project, most-recent first. */
  list: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) => listWorkspacesByProject(input.projectId)),

  /**
   * Rename a worktree: set its display name and rename its branch to a slug of
   * that name (directory stays put). Broadcasts on `onChange` so every view —
   * not just the caller — reflects the new name/branch. Shared with the
   * auto-title flow via `renameWorktree`.
   */
  rename: publicProcedure
    .input(renameWorktreeInputSchema)
    .mutation(async ({ input }): Promise<Workspace> => {
      const updated = await renameWorktree(input.workspaceId, input.name);
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found.' });
      return updated;
    }),

  /**
   * App-wide feed of worktree metadata changes (rename or a branch reconciled
   * from disk). The sidebar subscribes once and patches its cached worktree list.
   */
  onChange: publicProcedure.subscription(() =>
    observable<WorktreeChange>((emit) => worktreeEvents.onChange((change) => emit.next(change))),
  ),

  /**
   * The worktree + chat tab to reopen on reload: the first "recently active"
   * entry whose worktree still exists and isn't archived. A tab that has since
   * been closed is dropped to null so the client falls back to the first tab.
   * Returns null when no remembered worktree survives → the app shows the picker.
   */
  lastActive: publicProcedure.query((): RecentWorkspaceEntry | null => {
    for (const entry of getRecentWorkspaces()) {
      const ws = getWorkspace(entry.workspaceId);
      if (!ws || ws.archivedAt) continue;
      const tabId = entry.tabId && getTab(entry.tabId) ? entry.tabId : null;
      return { workspaceId: entry.workspaceId, tabId };
    }
    return null;
  }),

  /** Record the worktree + chat tab now in view so reload can restore it. */
  rememberActive: publicProcedure
    .input(z.object({ workspaceId: z.string(), tabId: z.string().nullable() }))
    .mutation(({ input }) => {
      rememberRecentWorkspace({ workspaceId: input.workspaceId, tabId: input.tabId });
    }),

  /** A project's local branch names — the base-ref choices for a new worktree. */
  listBranches: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }): Promise<string[]> => {
      const project = getProject(input.projectId);
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });
      return worktreeService.listBranches(project.localPath);
    }),

  /** Create a worktree (branch + linked env) under a project and seed its first tab. */
  create: publicProcedure
    .input(createWorktreeInputSchema)
    .mutation(async ({ input }): Promise<{ workspace: Workspace; tab: Tab }> => {
      try {
        return await createWorkspace(input);
      } catch (err) {
        if (err instanceof WorkspaceCreateError) {
          throw new TRPCError({ code: CREATE_ERROR_CODES[err.reason], message: err.message });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Failed to create worktree.',
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

      try {
        // Closes sessions/terminals, removes the worktree, deletes rows.
        await teardownWorkspace(ws, !!input.force);
      } catch (err) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: err instanceof Error ? err.message : 'Failed to remove worktree.',
        });
      }
    }),

  /**
   * Archive a merged worktree: hide it from the sidebar now and let the reaper
   * force-remove it from disk once the retention delay elapses. Soft-verifies
   * the branch's PR is merged (the sidebar only offers this on merge) — rejects
   * only on a definitive non-merged state, trusting the client when GitHub can't
   * be reached. Closes the worktree's live sessions so nothing runs while hidden.
   */
  archive: publicProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ input }) => {
      const ws = getWorkspace(input.workspaceId);
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found.' });

      // Best-effort merge guard: null means we couldn't tell (network/no PR) →
      // trust the client. A concrete non-merged state blocks the archive.
      const pr = await githubService.prStatus(ws.worktreePath, ws.branch).catch(() => null);
      if (pr && pr.state !== PrState.Merged) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This worktree can only be archived after its pull request is merged.',
        });
      }

      for (const tab of listTabs(ws.id)) claudeService.closeSession(tab.id);
      for (const term of listTerminalTabs(ws.id)) terminalService.kill(term.id);

      archiveWorkspace(ws.id, new Date().toISOString());
      // Reclaim disk now when the delay is "immediately"; otherwise this is a
      // no-op until the grace period elapses.
      void archiveReaperService.sweep();
    }),
});
