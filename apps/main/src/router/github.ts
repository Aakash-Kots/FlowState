/**
 * GitHub reads that back the analytics page — currently the linked account's
 * contribution calendar (the classic last-12-month heatmap). A thin door over
 * `githubService`; auth lives on the onboarding router / AuthService.
 */
import { type GithubContributionCalendar, githubContributionCalendarSchema } from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { githubService } from '../services/github';
import { publicProcedure, router } from '../trpc';

/** Wrap a GitHub call, surfacing its message as an INTERNAL_SERVER_ERROR. */
async function guard<T>(fn: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: err instanceof Error ? err.message : fallback,
    });
  }
}

export const githubRouter = router({
  /** The linked account's trailing-year contribution calendar. */
  contributionGraph: publicProcedure.query((): Promise<GithubContributionCalendar> =>
    guard(
      async () => githubContributionCalendarSchema.parse(await githubService.contributionCalendar()),
      'Failed to load your GitHub contribution graph.',
    ),
  ),
});
