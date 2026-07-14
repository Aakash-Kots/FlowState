import { z } from 'zod';
import { ArchiveRetention, CodeTheme } from '@flowstate/shared';
import {
  getArchiveRetention,
  getCodeTheme,
  getSkillsPanelOpen,
  getSkillsPanelWidth,
  getSoundEnabled,
  setArchiveRetention,
  setCodeTheme,
  setSkillsPanelOpen,
  setSkillsPanelWidth,
  setSoundEnabled,
} from '../store/settings';
import { publicProcedure, router } from '../trpc';

/**
 * User-facing app preferences (persisted in the `settings` key/value table). The
 * renderer loads them once on startup and writes back on change. Covers the
 * completion-sound toggle, the code-highlighting theme, and the archived-worktree
 * retention delay.
 */
export const settingsRouter = router({
  get: publicProcedure.query(() => ({
    soundEnabled: getSoundEnabled(),
    codeTheme: getCodeTheme(),
    archiveRetention: getArchiveRetention(),
    skillsPanelWidth: getSkillsPanelWidth(),
    skillsPanelOpen: getSkillsPanelOpen(),
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

  setArchiveRetention: publicProcedure
    .input(z.object({ retention: z.nativeEnum(ArchiveRetention) }))
    .mutation(({ input }) => {
      setArchiveRetention(input.retention);
    }),

  setSkillsPanelWidth: publicProcedure
    .input(z.object({ width: z.number() }))
    .mutation(({ input }) => {
      setSkillsPanelWidth(input.width);
    }),

  setSkillsPanelOpen: publicProcedure
    .input(z.object({ open: z.boolean() }))
    .mutation(({ input }) => {
      setSkillsPanelOpen(input.open);
    }),
});
