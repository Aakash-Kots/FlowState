/**
 * Skill-import control plane — brings a skill `.md` from another FlowState
 * project (or the global `~/.claude/skills`, or an arbitrary file) into the
 * current worktree: `listImportable` enumerates candidates, `pickFile` opens a
 * native picker, and `import` copies the file in, commits just it, pushes,
 * refreshes the session, and auto-pins it to the worktree. Discovery/copy live
 * in `SkillsImportService`; commit/push reuse `GitService`/`GithubService`; the
 * pin reuses the pins store.
 */
import { randomUUID } from 'node:crypto';
import {
  PinnedItemKind,
  type ImportableSkill,
  type PinnedItem,
  type Workspace,
} from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { BrowserWindow, dialog } from 'electron';
import { z } from 'zod';
import { getWorkspace, listPinsForWorkspace, upsertPin } from '../store';
import { claudeService } from '../services/claude';
import { GitService } from '../services/git';
import { githubService } from '../services/github';
import { skillsImportService } from '../services/skills';
import { publicProcedure, router } from '../trpc';

/////////////
// Helpers //
/////////////

/** Resolve a workspace to its worktree, or fail with NOT_FOUND. */
function requireWorkspace(workspaceId: string): Workspace {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found.' });
  return ws;
}

/** Outcome of an import: the created pin plus whether the push reached the remote. */
type ImportResult = { pin: PinnedItem; pushed: boolean; pushError: string | null };

export const skillsRouter = router({
  /** Skills the user could import into this worktree (other projects + global). */
  listImportable: publicProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(({ input }): Promise<ImportableSkill[]> => {
      const ws = requireWorkspace(input.workspaceId);
      return skillsImportService.listImportable(ws.worktreePath);
    }),

  /** Native picker for an arbitrary skill `.md`; returns its path or null (cancelled). */
  pickFile: publicProcedure.mutation(async (): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Choose a skill (.md) to import',
          properties: ['openFile'],
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        })
      : await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  }),

  /**
   * Copy `sourcePath` into the worktree's `.claude/skills/`, commit only that
   * file, push it, refresh the session's skills, and pin it to this worktree.
   * A push failure (no remote/token) is reported, not thrown — the copy + pin
   * still stand.
   */
  import: publicProcedure
    .input(z.object({ workspaceId: z.string(), tabId: z.string(), sourcePath: z.string().min(1) }))
    .mutation(async ({ input }): Promise<ImportResult> => {
      const ws = requireWorkspace(input.workspaceId);
      const { name, relPath } = await skillsImportService.importInto(
        ws.worktreePath,
        input.sourcePath,
      );

      // Commit only the imported file, then push. Both are best-effort: a no-op
      // commit (file already committed) or a failed push must not lose the pin.
      const git = new GitService(ws.worktreePath);
      let committed = false;
      try {
        await git.commitPaths([relPath], `chore: add ${name} skill`);
        committed = true;
      } catch {
        // Nothing to commit (identical/already-tracked) — the copy still stands.
      }
      let pushed = false;
      let pushError: string | null = null;
      if (committed) {
        try {
          await githubService.push(ws.worktreePath, ws.branch);
          pushed = true;
        } catch (err) {
          pushError = err instanceof Error ? err.message : 'Push failed.';
        }
      }

      // Let the live session pick up the new skill (best-effort).
      void claudeService.refreshSkillsForTab(input.tabId);

      // Auto-pin to this worktree (next position in scope).
      const position =
        listPinsForWorkspace(input.workspaceId).reduce((max, p) => Math.max(max, p.position), -1) +
        1;
      const pin = upsertPin({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        projectId: null,
        kind: PinnedItemKind.Skill,
        ref: name,
        label: name,
        position,
        createdAt: new Date().toISOString(),
      });
      return { pin, pushed, pushError };
    }),
});
