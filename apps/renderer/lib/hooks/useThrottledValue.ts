'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Throttle a rapidly-changing value to at most one propagation per `intervalMs`,
 * always flushing the latest value on the trailing edge. Used to cap how often
 * an expensive render runs while its input updates many times per second — e.g.
 * re-parsing streaming markdown, which is O(n) per parse and fires per token.
 */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastEmit = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastEmit.current;
    if (elapsed >= intervalMs) {
      // Enough time has passed — emit on the leading edge immediately.
      lastEmit.current = now;
      setThrottled(value);
      return;
    }
    // Within the window — schedule a trailing emit for the latest value. Each
    // new value reschedules, but the delay shrinks toward 0 so it always fires.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastEmit.current = Date.now();
      setThrottled(value);
    }, intervalMs - elapsed);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, intervalMs]);

  return throttled;
}
