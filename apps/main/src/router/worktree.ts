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
  UNTITLED_WORKSPACE_NAME,
  createWorktreeInputSchema,
  renameWorktreeInputSchema,
  type LinearIssue,
  type LinearIssueRef,
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
  upsertTab,
  upsertWorkspace,
} from '../store';
import { randomBranchName } from '../lib/branch-names';
import { PrState } from '@flowstate/shared';
import { archiveReaperService, teardownWorkspace } from '../services/archive';
import { claudeService } from '../services/claude';
import { GitService } from '../services/git';
import { githubService } from '../services/github';
import { linearService } from '../services/linear';
import { fileLinkService } from '../services/links';
import { terminalService } from '../services/terminal';
import { startWorkspaceScripts } from '../services/workspaceScripts';
import { worktreeService } from '../services/worktree';
import { renameWorktree, worktreeEvents } from '../services/worktreeEvents';
import { makeTab } from './tabs';
import { publicProcedure, router } from '../trpc';

/////////////
// Helpers //
/////////////

/** Linear's priority scale (0 none, 1 urgent, 2 high, 3 medium, 4 low). */
const PRIORITY_LABELS: Record<number, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

/**
 * A plain-text briefing on the linked Linear ticket for Claude's first turn.
 * Prefers the full issue (status/assignee/priority/description) when the fetch
 * succeeded, falling back to the small ref we always have.
 */
function buildTicketContext(ref: LinearIssueRef, full: LinearIssue | null): string {
  const lines = [
    `This worktree is linked to Linear ticket ${ref.identifier}: ${ref.title}`,
    `URL: ${ref.url}`,
  ];
  const stateName = full?.state.name ?? ref.stateName;
  if (stateName) lines.push(`Status: ${stateName}`);
  if (full) {
    lines.push(`Priority: ${PRIORITY_LABELS[full.priority] ?? PRIORITY_LABELS[0]}`);
    if (full.assignee) lines.push(`Assignee: ${full.assignee.name}`);
    if (full.description?.trim()) lines.push('', 'Description:', full.description.trim());
  }
  return lines.join('\n');
}

/**
 * Compose the first message sent to a new worktree's Claude session. With a linked
 * ticket we prepend its briefing; with a typed prompt too, the prompt follows the
 * briefing. A ticket but no prompt seeds context only — Claude should read the
 * ticket and wait for instructions rather than start changing code.
 */
async function composeSeed(
  ref: LinearIssueRef | null | undefined,
  prompt: string,
): Promise<string> {
  if (!ref) return prompt;
  const full = await linearService.issue(ref.id).catch(() => null);
  const context = buildTicketContext(ref, full);
  if (prompt) return `${context}\n\n---\n\n${prompt}`;
  return `${context}\n\nFamiliarise yourself with this ticket and wait for my instructions before making any changes.`;
}

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
      const project = getProject(input.projectId);
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });

      const repoRoot = project.localPath;
      const baseRef =
        input.baseRef?.trim() || project.worktreeBaseBranch || project.defaultBranch;
      // Branch name: an explicit override (e.g. the user-edited Linear branch), else
      // the linked issue's suggested branch, else a friendly random name that
      // `maybeGenerateTitle` later renames to a slug of the first chat. Made unique
      // so a name collision never fails creation.
      const desiredBranch =
        input.branch?.trim() || input.linearIssue?.branchName || randomBranchName();
      const branch = await worktreeService.uniqueBranchName(repoRoot, desiredBranch);
      const worktreePath = worktreeService.worktreePathFor(repoRoot, branch);

      // Refresh remote refs so the worktree is cut from the latest base branch,
      // not a stale local one. Best-effort: local-only repos (no GitHub origin)
      // throw here and fall back to the local base ref inside `create`.
      await githubService.fetch(repoRoot).catch(() => {});
      // Advance the local base branch to match the remote too, so it isn't left
      // stale after cutting the worktree from `origin/<base>`. Best-effort.
      await githubService.syncBaseBranch(repoRoot, baseRef).catch(() => {});

      // 1. Create the worktree + branch.
      try {
        await worktreeService.create({ repoRoot, branch, baseRef, worktreePath });
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
          name: UNTITLED_WORKSPACE_NAME,
          repoRoot,
          worktreePath,
          branch,
          baseRef,
          linearIssue: input.linearIssue ?? null,
          claudeState: ClaudeSessionState.Idle,
          claudeSessionId: null,
          archivedAt: null,
          createdAt: new Date().toISOString(),
        });
        const tab = upsertTab({
          ...makeTab(workspace.id, DEFAULT_TAB_TITLE, 0),
          // Start the first session in the requested mode (e.g. Plan) — seeded on
          // the tab so ensureSession picks it up before the initial prompt runs.
          ...(input.permissionMode ? { permissionMode: input.permissionMode } : {}),
        });

        // 4. Seed the Setup/Run terminals and run the project's Setup script in
        //    the new worktree so dependencies install the moment it exists; the
        //    Run script auto-starts once Setup finishes successfully.
        startWorkspaceScripts(workspace.id);

        // 5. Kick off the first session, seeding the linked ticket's context (and
        //    the user's prompt, if any) so Claude knows what it's working on.
        const seed = await composeSeed(input.linearIssue, input.initialPrompt?.trim() ?? '');
        if (seed) claudeService.send(tab.id, seed);

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
