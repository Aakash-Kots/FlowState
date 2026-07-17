'use client';

import { useEffect, useState } from 'react';

/////////////
// Helpers //
/////////////

// A single shared visibility+focus tracker fans out "is the window active?" to
// every subscriber, so N hooks don't each register their own
// visibilitychange/focus/blur listeners. "Active" means the window is both
// visible AND focused — anything else (hidden tab, minimized, another app in
// front) is inactive, so background pollers can pause and stop waking the CPU
// while the user isn't looking at FlowState.
const subscribers = new Set<(active: boolean) => void>();
let listening = false;
let active = true;

function compute(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible' && document.hasFocus();
}

function evaluate(): void {
  const next = compute();
  if (next === active) return;
  active = next;
  for (const cb of subscribers) cb(active);
}

function ensureListening(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  active = compute();
  document.addEventListener('visibilitychange', evaluate);
  window.addEventListener('focus', evaluate);
  window.addEventListener('blur', evaluate);
}

//////////
// Hook //
//////////

/**
 * `true` while the app window is visible and focused, re-rendering the caller on
 * every transition. Gate recurring timers on this (`if (!active) return;` inside
 * their effect) so they pause when FlowState is backgrounded and resume — with an
 * immediate refresh — when it returns to the foreground.
 */
export function useWindowActive(): boolean {
  const [state, setState] = useState<boolean>(() => {
    ensureListening();
    return active;
  });
  useEffect(() => {
    ensureListening();
    // Sync in case the window changed state between render and effect commit.
    setState(active);
    subscribers.add(setState);
    return () => {
      subscribers.delete(setState);
    };
  }, []);
  return state;
}
