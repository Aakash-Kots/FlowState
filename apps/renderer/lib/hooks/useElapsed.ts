'use client';

import { useEffect, useState } from 'react';
import { useWindowActive } from './useWindowActive';

/** Live elapsed milliseconds since `startedAt`, ticking each second (null = off). */
export function useElapsed(startedAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  // Pause the 1Hz re-render while the window is backgrounded — the turn keeps
  // running in main; this only drives the on-screen tick, which nobody is
  // watching when FlowState is hidden or blurred. Reactivating snaps it current.
  const active = useWindowActive();
  useEffect(() => {
    if (startedAt == null || !active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, active]);
  return startedAt == null ? null : Math.max(0, now - startedAt);
}
