'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import type { SystemMetrics } from '@flowstate/shared';
import { useWindowActive } from './hooks/useWindowActive';
import { trpc } from './trpc';

///////////
// Types //
///////////

type SystemStatsState = {
  /** True once we've received the first sample (or a null one) from main. */
  hydrated: boolean;
  metrics: SystemMetrics | null;
};

///////////////
// Constants //
///////////////

const INITIAL: SystemStatsState = { hydrated: false, metrics: null };

export const useSystemStats = create<SystemStatsState>(() => INITIAL);

///////////
// Sync  //
///////////

let seeded = false;

/**
 * Keep the machine's live resource sample fresh. Seeds once from the `metrics`
 * query so the widget shows a value immediately, then streams via `onMetrics`.
 *
 * The subscription is what starts main's 2s `systeminformation` sampler (it's
 * ref-counted; the sampler stops when nothing is subscribed), so we hold it only
 * while the window is active — when FlowState is hidden or blurred we unsubscribe,
 * dropping main's ref-count to 0 and stopping the periodic `si.mem()` /
 * `si.currentLoad()` shell-outs entirely. Main emits a fresh sample immediately
 * on re-subscribe, so the widget snaps current the moment the window returns.
 */
export function useSystemStatsSync(): void {
  const active = useWindowActive();
  useEffect(() => {
    const set = (metrics: SystemMetrics | null) =>
      useSystemStats.setState({ hydrated: true, metrics });

    if (!seeded) {
      seeded = true;
      trpc()
        .system.metrics.query()
        .then(set)
        .catch((err) => {
          console.warn('[systemStats] metrics query failed', err);
          useSystemStats.setState({ hydrated: true });
        });
    }

    if (!active) return;
    const sub = trpc().system.onMetrics.subscribe(undefined, {
      onData: set,
      onError: () => {},
    });
    return () => sub.unsubscribe();
  }, [active]);
}
