import { observable } from '@trpc/server/observable';
import { BrowserWindow, dialog } from 'electron';
import { z } from 'zod';
import type { ChatEvent } from '@flowstate/shared';
import { claudeService } from '../services/claude';
import { publicProcedure, router } from '../trpc';

// Chat control plane: mutations drive the session (send / interrupt /
// permission decisions), `snapshot` hydrates on mount, and `onEvent` streams
// normalized ChatEvents — the same mutations + observable split as terminal.ts.
export const claudeRouter = router({
  snapshot: publicProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(({ input }) => claudeService.getSnapshot(input.workspaceId)),

  send: publicProcedure
    .input(z.object({ workspaceId: z.string(), text: z.string().min(1) }))
    .mutation(({ input }) => {
      claudeService.send(input.workspaceId, input.text);
    }),

  interrupt: publicProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(({ input }) => claudeService.interrupt(input.workspaceId)),

  respondPermission: publicProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        requestId: z.string(),
        behavior: z.enum(['allow', 'deny']),
        message: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      claudeService.respondPermission(
        input.workspaceId,
        input.requestId,
        input.behavior,
        input.message,
      );
    }),

  // Native folder picker for the session's working directory. Picking a new
  // folder resets the session (a resumed conversation under a different cwd
  // would be incoherent).
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

  onEvent: publicProcedure.input(z.object({ workspaceId: z.string() })).subscription(({ input }) =>
    observable<ChatEvent>((emit) =>
      claudeService.onEvent(input.workspaceId, (event) => emit.next(event)),
    ),
  ),
});
