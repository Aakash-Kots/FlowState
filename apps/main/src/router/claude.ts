import { observable } from '@trpc/server/observable';
import { BrowserWindow, dialog } from 'electron';
import { z } from 'zod';
import { PermissionBehavior, ReasoningEffort, type ChatEvent } from '@flowstate/shared';
import { claudeService } from '../services/claude';
import { publicProcedure, router } from '../trpc';

// Chat control plane, keyed by tabId (one Claude session per tab): mutations
// drive the session (send / interrupt / permission decisions), `snapshot`
// hydrates on mount, and `onEvent` streams normalized ChatEvents — the same
// mutations + observable split as terminal.ts. `pickCwd` is project-level
// (keyed by workspaceId) since all tabs share the project's working folder.
export const claudeRouter = router({
  // A workspace's working folder — its worktree path (null until it has one).
  cwd: publicProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(({ input }) => claudeService.getCwd(input.workspaceId)),

  snapshot: publicProcedure
    .input(z.object({ tabId: z.string() }))
    .query(({ input }) => claudeService.getSnapshot(input.tabId)),

  send: publicProcedure
    .input(z.object({ tabId: z.string(), text: z.string().min(1) }))
    .mutation(({ input }) => {
      claudeService.send(input.tabId, input.text);
    }),

  interrupt: publicProcedure
    .input(z.object({ tabId: z.string() }))
    .mutation(({ input }) => claudeService.interrupt(input.tabId)),

  // Models the tab can run (live from the SDK when a session exists, else defaults).
  supportedModels: publicProcedure
    .input(z.object({ tabId: z.string() }))
    .query(({ input }) => claudeService.getSupportedModels(input.tabId)),

  setModel: publicProcedure
    .input(z.object({ tabId: z.string(), model: z.string().min(1) }))
    .mutation(({ input }) => claudeService.setModel(input.tabId, input.model)),

  setEffort: publicProcedure
    .input(z.object({ tabId: z.string(), effort: z.nativeEnum(ReasoningEffort) }))
    .mutation(({ input }) => {
      claudeService.setEffort(input.tabId, input.effort);
    }),

  answerQuestion: publicProcedure
    .input(
      z.object({
        tabId: z.string(),
        requestId: z.string(),
        answers: z.record(z.string(), z.string()),
      }),
    )
    .mutation(({ input }) => {
      claudeService.answerQuestion(input.tabId, input.requestId, input.answers);
    }),

  respondPermission: publicProcedure
    .input(
      z.object({
        tabId: z.string(),
        requestId: z.string(),
        behavior: z.nativeEnum(PermissionBehavior),
        message: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      claudeService.respondPermission(input.tabId, input.requestId, input.behavior, input.message);
    }),

  // Native folder picker for the project's working directory. Picking a new
  // folder resets every tab's session (a resumed conversation under a different
  // cwd would be incoherent).
  pickCwd: publicProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ input }) => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const result = win
        ? await dialog.showOpenDialog(win, {
            title: 'Choose a folder for Claude to work in',
            properties: ['openDirectory', 'createDirectory'],
          })
        : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
      const cwd = result.canceled ? null : (result.filePaths[0] ?? null);
      if (cwd) claudeService.setCwd(input.workspaceId, cwd);
      return { cwd };
    }),

  onEvent: publicProcedure
    .input(z.object({ tabId: z.string() }))
    .subscription(({ input }) =>
      observable<ChatEvent>((emit) =>
        claudeService.onEvent(input.tabId, (event) => emit.next(event)),
      ),
    ),
});
