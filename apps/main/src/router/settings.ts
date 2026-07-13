import { z } from 'zod';
import { CodeTheme } from '@flowstate/shared';
import { getCodeTheme, getSoundEnabled, setCodeTheme, setSoundEnabled } from '../store/settings';
import { publicProcedure, router } from '../trpc';

/**
 * User-facing app preferences (persisted in the `settings` key/value table). The
 * renderer loads them once on startup and writes back on change. Covers the
 * completion-sound toggle and the code-highlighting theme.
 */
export const settingsRouter = router({
  get: publicProcedure.query(() => ({
    soundEnabled: getSoundEnabled(),
    codeTheme: getCodeTheme(),
  })),

  setSoundEnabled: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => {
      setSoundEnabled(input.enabled);
    }),

  setCodeTheme: publicProcedure
    .input(z.object({ theme: z.nativeEnum(CodeTheme) }))
    .mutation(({ input }) => {
      setCodeTheme(input.theme);
    }),
});
