/**
 * Runtime validation for the GitHub domain. Mirrors `../types/github`.
 */
import { z } from 'zod';
import type { GithubContributionCalendar, GithubContributionDay } from '../types/github';

export const githubContributionDaySchema: z.ZodType<GithubContributionDay> = z.object({
  day: z.string(),
  count: z.number(),
  level: z.number(),
});

export const githubContributionCalendarSchema: z.ZodType<GithubContributionCalendar> = z.object({
  totalContributions: z.number(),
  weeks: z.array(z.array(githubContributionDaySchema)),
});
