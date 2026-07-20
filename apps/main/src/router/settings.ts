import { z } from 'zod';
import { ArchiveRetention, CodeTheme, FontSize } from '@flowstate/shared';
import { SecretName } from '../lib/enums/secret';
import { geminiService } from '../services/gemini';
import { deleteSecret, hasSecret, setSecret } from '../store/secrets';
import {
  getArchiveRetention,
  getCodeTheme,
  getDefaultTeamId,
  getFontSize,
  getSkillsPanelOpen,
  getSkillsPanelWidth,
  getSoundEnabled,
  getSurfacedTeamIds,
  getTerminalPanelFraction,
  setArchiveRetention,
  setCodeTheme,
  setDefaultTeamId,
  setFontSize,
  setSkillsPanelOpen,
  setSkillsPanelWidth,
  setSoundEnabled,
  setSurfacedTeamIds,
  setTerminalPanelFraction,
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
    fontSize: getFontSize(),
    archiveRetention: getArchiveRetention(),
    skillsPanelWidth: getSkillsPanelWidth(),
    skillsPanelOpen: getSkillsPanelOpen(),
    terminalPanelFraction: getTerminalPanelFraction(),
    surfacedTeamIds: getSurfacedTeamIds(),
    defaultTeamId: getDefaultTeamId(),
    // Only whether a key exists — the plaintext key never leaves the main process.
    geminiApiKeySet: hasSecret(SecretName.GeminiApiKey),
  })),

  /** Store the user's Gemini API key (encrypted via safeStorage). Powers Ask
   * Gemini, ticket refinement, and speech-to-text. */
  setGeminiApiKey: publicProcedure
    .input(z.object({ apiKey: z.string().min(1) }))
    .mutation(({ input }) => {
      setSecret(SecretName.GeminiApiKey, input.apiKey.trim());
      geminiService.notifyKeyChanged();
    }),

  /** Remove the stored Gemini API key. */
  clearGeminiApiKey: publicProcedure.mutation(() => {
    deleteSecret(SecretName.GeminiApiKey);
    geminiService.notifyKeyChanged();
  }),

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

  setFontSize: publicProcedure
    .input(z.object({ size: z.nativeEnum(FontSize) }))
    .mutation(({ input }) => {
      setFontSize(input.size);
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

  setTerminalPanelFraction: publicProcedure
    .input(z.object({ fraction: z.number() }))
    .mutation(({ input }) => {
      setTerminalPanelFraction(input.fraction);
    }),

  setSurfacedTeamIds: publicProcedure
    .input(z.object({ teamIds: z.array(z.string()) }))
    .mutation(({ input }) => {
      setSurfacedTeamIds(input.teamIds);
    }),

  setDefaultTeam: publicProcedure
    .input(z.object({ teamId: z.string().nullable() }))
    .mutation(({ input }) => {
      setDefaultTeamId(input.teamId);
    }),
});
