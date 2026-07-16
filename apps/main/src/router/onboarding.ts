import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import type { OnboardingStatus } from '../lib/types/onboarding';
import { authService } from '../services/auth';
import { publicProcedure, router } from '../trpc';

// The Connect / onboarding surface: Claude Code + GitHub authentication. The
// heavy lifting lives in AuthService; this router is a thin, zod-validated door.
// The renderer subscribes to `onStatus` once and drives the first-run gate and
// the live status pills from it.
export const onboardingRouter = router({
  /** Persisted connection state — cheap, drives the gate. */
  status: publicProcedure.query((): OnboardingStatus => authService.status()),

  /** Live-check both CLIs and reconcile persisted state (Connect-screen mount / manual re-check). */
  refresh: publicProcedure.mutation(() => authService.refresh()),

  /** Push connection-state changes to the renderer as they happen. */
  onStatus: publicProcedure.subscription(() =>
    observable<OnboardingStatus>((emit) => {
      emit.next(authService.status());
      const onStatus = (s: OnboardingStatus) => emit.next(s);
      authService.on('status', onStatus);
      return () => authService.off('status', onStatus);
    }),
  ),

  /** Run `claude auth login` in the given terminal and watch for completion. */
  claudeBeginLogin: publicProcedure
    .input(z.object({ terminalId: z.string() }))
    .mutation(({ input }) => authService.beginClaudeLogin(input.terminalId)),

  /** Run `gh auth login` in the given terminal and watch for completion. */
  githubBeginLogin: publicProcedure
    .input(z.object({ terminalId: z.string() }))
    .mutation(({ input }) => authService.beginGithubLogin(input.terminalId)),

  /** Log out of Claude (to switch accounts) and clear our persisted state. */
  claudeLogout: publicProcedure
    .input(z.object({ terminalId: z.string() }))
    .mutation(({ input }) => authService.claudeLogout(input.terminalId)),

  /** Log out of GitHub and clear the stored token. */
  githubLogout: publicProcedure
    .input(z.object({ terminalId: z.string() }))
    .mutation(({ input }) => authService.githubLogout(input.terminalId)),

  /** Whether the `gh` CLI is installed — controls the PAT-paste fallback. */
  githubHasCli: publicProcedure.query(() => authService.hasGithubCli()),

  /** Fallback for machines without `gh`: store a pasted personal access token. */
  githubSetToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(({ input }) => authService.setGithubToken(input.token)),

  /** Start the Linear OAuth browser flow (no terminal — opens the system browser). */
  linearBeginLogin: publicProcedure.mutation(() => authService.beginLinearLogin()),

  /** Cancel an in-flight Linear OAuth flow. */
  linearCancelLogin: publicProcedure.mutation(() => authService.cancelLinearLogin()),

  /** Disconnect Linear and clear the stored token. */
  linearLogout: publicProcedure.mutation(() => authService.linearLogout()),

  /** Start the Slack OAuth browser flow (no terminal — opens the system browser). */
  slackBeginLogin: publicProcedure.mutation(() => authService.beginSlackLogin()),

  /** Cancel an in-flight Slack OAuth flow. */
  slackCancelLogin: publicProcedure.mutation(() => authService.cancelSlackLogin()),

  /** Disconnect Slack and clear the stored token. */
  slackLogout: publicProcedure.mutation(() => authService.slackLogout()),
});
