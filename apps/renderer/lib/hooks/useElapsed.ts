'use client';

import { useEffect, useState } from 'react';

/** Live elapsed milliseconds since `startedAt`, ticking each second (null = off). */
export function useElapsed(startedAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt == null ? null : Math.max(0, now - startedAt);
}
