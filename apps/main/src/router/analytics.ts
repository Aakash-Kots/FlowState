/**
 * Read-only analytics for the header's Analytics page. A single `summary` query
 * returns every aggregate the page renders for the selected time range, composed
 * from the usage ledger, the activity ledger, and entity lifecycle timestamps.
 */
import { type AnalyticsSummary, analyticsSummaryInputSchema, analyticsSummarySchema } from '@flowstate/shared';
import { getCommitHistoryStats } from '../services/commitHistory';
import { getAnalyticsSummary, rangeCutoff } from '../store';
import { publicProcedure, router } from '../trpc';

export const analyticsRouter = router({
  summary: publicProcedure
    .input(analyticsSummaryInputSchema)
    .query(async ({ input }): Promise<AnalyticsSummary> => {
      const commits = await getCommitHistoryStats(rangeCutoff(input.range));
      return analyticsSummarySchema.parse({ ...getAnalyticsSummary(input.range), ...commits });
    }),
});
