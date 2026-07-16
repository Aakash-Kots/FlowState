'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { trpc } from './trpc';

type FullScreenState = {
  isFullScreen: boolean;
  setFullScreen: (v: boolean) => void;
};

export const useFullScreen = create<FullScreenState>((set) => ({
  isFullScreen: false,
  setFullScreen: (v) => {
    // Reflect onto the document so a global CSS rule can bump the vibrancy
    // sidebar to near-opaque in full-screen (see globals.css).
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.fullscreen = String(v);
    }
    set({ isFullScreen: v });
  },
}));

let started = false;

/**
 * Subscribe to main-process full-screen state exactly once for the app's
 * lifetime. Seeds from the current state and stays live via `onFullScreen`.
 * Mount this near the app root.
 */
export function useFullScreenSync(): void {
  useEffect(() => {
    if (started) return;
    started = true;

    const set = useFullScreen.getState().setFullScreen;

    trpc()
      .app.isFullScreen.query()
      .then(set)
      .catch(() => {});

    const sub = trpc().app.onFullScreen.subscribe(undefined, {
      onData: set,
      onError: () => {},
    });

    return () => sub.unsubscribe();
  }, []);
}
