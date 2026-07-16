/**
 * Terminal control plane. Two concerns share this router:
 *
 * 1. Pty lifecycle + I/O — `spawn`/`input`/`resize`/`kill` mutations and the
 *    `onData` subscription (electron-trpc drives the observable's next/complete
 *    back to xterm.js). `snapshot` returns retained scrollback so a reattaching
 *    renderer can replay before subscribing. Bulk multi-tab terminals may move
 *    to a dedicated raw IPC channel later (milestone 2); tRPC is plenty for now.
 *
 * 2. Terminal-tab metadata — `listTabs` seeds the two project-scoped default
 *    tabs (Setup + Run) and returns the persisted set; `createTab`/`closeTab`/
 *    `renameTab` manage the (≤ MAX_TERMINALS_PER_WORKSPACE) ad-hoc shells.
 */
import { randomUUID } from 'node:crypto';
import { observable } from '@trpc/server/observable';
import { TRPCError } from '@trpc/server';
import {
  DEFAULT_TERMINAL_TITLE,
  MAX_TERMINALS_PER_WORKSPACE,
  TerminalKind,
  createTerminalTabInputSchema,
} from '@flowstate/shared';
import { z } from 'zod';
import {
  deleteTerminalTab,
  ensureDefaults,
  getProject,
  getTerminalTab,
  getWorkspace,
  listTerminalTabs,
  upsertTerminalTab,
} from '../store';
import { terminalService } from '../services/terminal';
import { rerunSetupScript, startWorkspaceScripts } from '../services/workspaceScripts';
import { publicProcedure, router } from '../trpc';

export const terminalRouter = router({
  spawn: publicProcedure
    .input(
      z
        .object({
          id: z.string().optional(),
          cwd: z.string().optional(),
          cols: z.number().int().positive().optional(),
          rows: z.number().int().positive().optional(),
          startupCommand: z.string().optional(),
        })
        .optional(),
    )
    .mutation(({ input }) => terminalService.spawn(input ?? {})),

  input: publicProcedure
    .input(z.object({ id: z.string(), data: z.string() }))
    .mutation(({ input }) => {
      terminalService.write(input.id, input.data);
    }),

  resize: publicProcedure
    .input(
      z.object({
        id: z.string(),
        cols: z.number().int().positive(),
        rows: z.number().int().positive(),
      }),
    )
    .mutation(({ input }) => {
      terminalService.resize(input.id, input.cols, input.rows);
    }),

  kill: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    terminalService.kill(input.id);
  }),

  /**
   * Start the workspace's Setup script now and, on success, its Run script —
   * called when the terminal panel mounts (and at worktree creation). Idempotent:
   * a running script is a no-op reattach.
   */
  startScripts: publicProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(({ input }) => {
      startWorkspaceScripts(input.workspaceId);
    }),

  /** Re-run the workspace's Setup script (the Setup tab's "Re-run" button). */
  rerunSetup: publicProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(({ input }) => {
      rerunSetupScript(input.workspaceId);
    }),

  /**
   * Emits a terminal's script exit code each time its tracked command completes
   * (immediately with the last known code if it already finished). Drives the
   * Setup tab's "Setup script finished / failed" state.
   */
  onComplete: publicProcedure.input(z.object({ id: z.string() })).subscription(({ input }) =>
    observable<number>((emit) => terminalService.onComplete(input.id, (code) => emit.next(code))),
  ),

  // Replays the session's retained scrollback as the first emission, then streams
  // live output — so a renderer reattaching to a persistent terminal (after a
  // view/worktree switch remounts its xterm) repaints without a snapshot round
  // trip or a gap. Reading scrollback and attaching the listener happen
  // synchronously, so no chunk slips between the two.
  onData: publicProcedure.input(z.object({ id: z.string() })).subscription(({ input }) =>
    observable<string>((emit) => {
      const replay = terminalService.snapshot(input.id);
      const offData = terminalService.onData(input.id, (chunk) => emit.next(chunk));
      const offExit = terminalService.onExit(input.id, () => emit.complete());
      if (replay) emit.next(replay);
      return () => {
        offData();
        offExit();
      };
    }),
  ),

  ///////////////////////
  // Terminal-tab CRUD //
  ///////////////////////

  /** The workspace's terminal tabs — Setup + Run first, then ad-hoc shells. */
  listTabs: publicProcedure.input(z.object({ workspaceId: z.string() })).query(({ input }) => {
    const ws = getWorkspace(input.workspaceId);
    const project = ws?.projectId ? getProject(ws.projectId) : null;
    return ensureDefaults(input.workspaceId, project);
  }),

  createTab: publicProcedure.input(createTerminalTabInputSchema).mutation(({ input }) => {
    const tabs = listTerminalTabs(input.workspaceId);
    const shells = tabs.filter((t) => t.kind === TerminalKind.Shell);
    if (shells.length >= MAX_TERMINALS_PER_WORKSPACE) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `A workspace can have at most ${MAX_TERMINALS_PER_WORKSPACE} terminals.`,
      });
    }
    const position = tabs.reduce((max, t) => Math.max(max, t.position), -1) + 1;
    return upsertTerminalTab({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      title: input.title ?? DEFAULT_TERMINAL_TITLE,
      kind: TerminalKind.Shell,
      command: null,
      position,
      createdAt: new Date().toISOString(),
    });
  }),

  renameTab: publicProcedure
    .input(z.object({ tabId: z.string(), title: z.string().min(1) }))
    .mutation(({ input }) => {
      const tab = getTerminalTab(input.tabId);
      if (!tab) throw new TRPCError({ code: 'NOT_FOUND', message: 'Terminal not found.' });
      return upsertTerminalTab({ ...tab, title: input.title });
    }),

  /** Close a shell terminal: kill its pty, delete the row. Default tabs can't be closed. */
  closeTab: publicProcedure.input(z.object({ tabId: z.string() })).mutation(({ input }) => {
    const tab = getTerminalTab(input.tabId);
    if (!tab) return;
    if (tab.kind !== TerminalKind.Shell) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'The Setup and Run terminals cannot be closed.',
      });
    }
    terminalService.kill(input.tabId);
    deleteTerminalTab(input.tabId);
  }),
});
