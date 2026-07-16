'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import type { SystemMetrics } from '@flowstate/shared';
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

let started = false;

/**
 * Keep the machine's live resource sample fresh for the app's lifetime. Seeds
 * from the `metrics` query, then streams via `onMetrics` (subscribing starts the
 * main-process sampler; it stops when nothing is subscribed).
 *
 * Deliberately app-lifetime with NO cleanup, matching `useUsageSync`: the header
 * widget that mounts this survives view switches, and returning an unsubscribe
 * would tear the stream down on the first unmount while the `started` guard
 * blocks re-subscription. Subscribe once, keep it for the whole session.
 */
export function useSystemStatsSync(): void {
  useEffect(() => {
    if (started) return;
    started = true;

    const set = (metrics: SystemMetrics | null) =>
      useSystemStats.setState({ hydrated: true, metrics });

    trpc()
      .system.metrics.query()
      .then(set)
      .catch((err) => {
        console.warn('[systemStats] metrics query failed', err);
        useSystemStats.setState({ hydrated: true });
      });

    trpc().system.onMetrics.subscribe(undefined, {
      onData: set,
      onError: () => {},
    });
  }, []);
}
