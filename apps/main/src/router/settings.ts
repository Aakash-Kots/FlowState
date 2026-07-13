import { z } from 'zod';
import { getSoundEnabled, setSoundEnabled } from '../store/settings';
import { publicProcedure, router } from '../trpc';

/**
 * User-facing app preferences (persisted in the `settings` key/value table).
 * Currently just the completion-sound toggle; the renderer loads this once on
 * startup and writes back on change.
 */
export const settingsRouter = router({
  get: publicProcedure.query(() => ({ soundEnabled: getSoundEnabled() })),

  setSoundEnabled: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => {
      setSoundEnabled(input.enabled);
    }),
});
