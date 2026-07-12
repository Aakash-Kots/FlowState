import { app } from 'electron';
import type { AppInfo } from '@flowstate/shared';
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
});
