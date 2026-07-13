import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { terminalService } from '../services/terminal';
import { publicProcedure, router } from '../trpc';

// Onboarding terminal: lifecycle + keystrokes over tRPC mutations, and pty
// output over a tRPC subscription. electron-trpc drives the observable's
// next/complete back to the renderer's xterm.js and tears it down on unsubscribe
// / window navigation. Bulk multi-tab terminals move to a dedicated raw IPC
// channel later (milestone 2); at onboarding volume tRPC is plenty.
export const terminalRouter = router({
  spawn: publicProcedure
    .input(
      z
        .object({
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

  onData: publicProcedure.input(z.object({ id: z.string() })).subscription(({ input }) =>
    observable<string>((emit) => {
      const offData = terminalService.onData(input.id, (chunk) => emit.next(chunk));
      const offExit = terminalService.onExit(input.id, () => emit.complete());
      return () => {
        offData();
        offExit();
      };
    }),
  ),
});
