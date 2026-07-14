import { observable } from '@trpc/server/observable';
import { usageLimitsSchema, type UsageLimits } from '@flowstate/shared';
import { claudeService } from '../services/claude';
import { publicProcedure, router } from '../trpc';

// Account-global Claude subscription usage limits for the header widget. `limits`
// returns the cached snapshot (null before the first poll, or on API-key sessions
// where plan limits don't apply); `onLimits` streams fresh snapshots as the
// service re-polls (every N turns + on session init) and on rate-limit pushes.
export const usageRouter = router({
  limits: publicProcedure.query(() => {
    const limits = claudeService.getUsageLimits();
    return limits ? usageLimitsSchema.parse(limits) : null;
  }),

  onLimits: publicProcedure.subscription(() =>
    observable<UsageLimits>((emit) =>
      claudeService.onUsageLimits((limits) => emit.next(usageLimitsSchema.parse(limits))),
    ),
  ),
});
