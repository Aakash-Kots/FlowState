import { observable } from '@trpc/server/observable';
import { systemMetricsSchema, type SystemMetrics } from '@flowstate/shared';
import { systemMetricsService } from '../services/systemMetrics';
import { publicProcedure, router } from '../trpc';

// Live machine resource usage for the header widget. `metrics` returns the
// cached snapshot (null before the first sample); `onMetrics` streams fresh
// samples — subscribing starts the sampler, unsubscribing stops it (ref-counted
// in the service), so no polling runs while the widget isn't mounted.
export const systemRouter = router({
  metrics: publicProcedure.query(() => {
    const snapshot = systemMetricsService.getSnapshot();
    return snapshot ? systemMetricsSchema.parse(snapshot) : null;
  }),

  onMetrics: publicProcedure.subscription(() =>
    observable<SystemMetrics>((emit) =>
      systemMetricsService.onMetrics((metrics) => emit.next(systemMetricsSchema.parse(metrics))),
    ),
  ),
});
