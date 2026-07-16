import { app, shell } from 'electron';
import { observable } from '@trpc/server/observable';
import type { AppInfo } from '@flowstate/shared';
import { z } from 'zod';
import { fullScreenService } from '../services/fullscreen';
import { publicProcedure, router } from '../trpc';

/**
 * Minimal always-on router. `app.info` is the end-to-end IPC smoke test — the
 * renderer calls it on load and displays the result to prove the bridge works.
 */
export const appRouter = router({
  info: publicProcedure.query((): AppInfo => {
    return {
      name: 'FlowState',
      version: app.getVersion(),
      platform: process.platform,
    };
  }),
  ping: publicProcedure.query(() => 'pong'),

  /** Open a URL in the user's default browser (e.g. a freshly created PR). */
  openExternal: publicProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(({ input }) => shell.openExternal(input.url)),

  /** Current window full-screen state (seeds the renderer on load). */
  isFullScreen: publicProcedure.query(() => fullScreenService.get()),

  /** Push full-screen transitions to the renderer (drives sidebar opacity). */
  onFullScreen: publicProcedure.subscription(() =>
    observable<boolean>((emit) => {
      emit.next(fullScreenService.get());
      return fullScreenService.onChange((v) => emit.next(v));
    }),
  ),
});
