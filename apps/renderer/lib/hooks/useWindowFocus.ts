'use client';

import { useEffect, useRef } from 'react';

///////////////
// Constants //
///////////////

/** Collapse a focus event (and any refocus jitter) into one dispatch (ms). */
const FOCUS_DEBOUNCE_MS = 150;

/////////////
// Helpers //
/////////////

// A single shared window-focus listener fans out to every subscriber, so N
// mounted sidebar rows don't each register their own handler and stampede the
// backend with 2N git/GitHub calls on every alt-tab. The dispatch is debounced
// so a burst of focus/blur jitter triggers just one refresh.
const subscribers = new Set<() => void>();
let listening = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function dispatch(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    for (const cb of subscribers) cb();
  }, FOCUS_DEBOUNCE_MS);
}

function ensureListening(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('focus', dispatch);
}

///////////
// Hook  //
///////////

/**
 * Run `cb` when the app window regains focus, via a single shared, debounced
 * listener. Prefer this over a per-component `window.addEventListener('focus')`
 * anywhere the same effect is mounted once per row/tab.
 */
export function useWindowFocus(cb: () => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    ensureListening();
    const sub = () => ref.current();
    subscribers.add(sub);
    return () => {
      subscribers.delete(sub);
    };
  }, []);
}
