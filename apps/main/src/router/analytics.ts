/**
 * Read-only analytics for the header's Analytics page. A single `summary` query
 * returns every aggregate the page renders for the selected time range, composed
 * from the usage ledger, the activity ledger, and entity lifecycle timestamps.
 */
import { type AnalyticsSummary, analyticsSummaryInputSchema, analyticsSummarySchema } from '@flowstate/shared';
import { getAnalyticsSummary } from '../store';
import { publicProcedure, router } from '../trpc';

export const analyticsRouter = router({
  summary: publicProcedure
    .input(analyticsSummaryInputSchema)
    .query(({ input }): AnalyticsSummary => analyticsSummarySchema.parse(getAnalyticsSummary(input.range))),
});
