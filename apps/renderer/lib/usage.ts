'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import type { UsageLimits } from '@flowstate/shared';
import { trpc } from './trpc';

///////////
// Types //
///////////

type UsageStoreState = {
  /** True once we've received the first snapshot (or a null one) from main. */
  hydrated: boolean;
  limits: UsageLimits | null;
};

///////////////
// Constants //
///////////////

const INITIAL: UsageStoreState = { hydrated: false, limits: null };

export const useUsage = create<UsageStoreState>(() => INITIAL);

///////////
// Sync  //
///////////

let started = false;

/**
 * Keep the account-global Claude usage snapshot live for the app's lifetime.
 * Seeds from the `limits` query, then stays fresh via `onLimits` (the main
 * process re-polls every N turns + on session init, and pushes rate-limit
 * events). `onLimits` sends full snapshots, so there's no subscribe/seed race.
 *
 * Deliberately app-lifetime with NO cleanup: the widget that mounts this lives
 * in a panel that unmounts on view switches / collapse / workspace changes.
 * Returning an unsubscribe would tear the stream down on the first unmount, and
 * the `started` guard would then block re-subscription — leaving the store stale
 * forever. Subscribe once, keep it for the whole session.
 */
export function useUsageSync(): void {
  useEffect(() => {
    if (started) return;
    started = true;

    const set = (limits: UsageLimits | null) => useUsage.setState({ hydrated: true, limits });

    trpc()
      .usage.limits.query()
      .then(set)
      .catch((err) => {
        console.warn('[usage] limits query failed', err);
        useUsage.setState({ hydrated: true });
      });

    trpc().usage.onLimits.subscribe(undefined, {
      onData: set,
      onError: () => {},
    });
  }, []);
}
