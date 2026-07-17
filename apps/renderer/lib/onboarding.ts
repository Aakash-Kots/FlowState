'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { trpc } from './trpc';

type OnboardingStatus = {
  claudeConnected: boolean;
  githubConnected: boolean;
  linearConnected: boolean;
  spotifyConnected: boolean;
};

type OnboardingState = OnboardingStatus & {
  /** True once we've received the first status from the main process. */
  hydrated: boolean;
  setStatus: (s: OnboardingStatus) => void;
};

export const useOnboarding = create<OnboardingState>((set) => ({
  claudeConnected: false,
  githubConnected: false,
  linearConnected: false,
  spotifyConnected: false,
  hydrated: false,
  setStatus: (s) => set({ ...s, hydrated: true }),
}));

/**
 * Claude + GitHub connected → the first-run gate is satisfied. Linear is
 * intentionally excluded — it is an optional integration, not an onboarding step.
 */
export function useIsOnboarded(): boolean {
  return useOnboarding((s) => s.claudeConnected && s.githubConnected);
}

// Subscribe to onboarding status exactly once for the app's lifetime
// (mirrors the chat/terminal/menu subscription guard — no cleanup, StrictMode-safe).
let started = false;

/**
 * Subscribe to main-process onboarding status for the app's lifetime. Seeds from
 * the persisted status query for a fast first paint and stays live via the
 * `onStatus` subscription (which also re-emits current status on subscribe).
 * Mount this near the app root.
 *
 * Intentionally no cleanup: this binding is app-lifetime by design. Returning an
 * unsubscribe here breaks under React StrictMode's dev double-mount (and on any
 * route change between the mount points) — the first mount's cleanup would kill
 * the only subscription while the `started` guard stops the remount from
 * re-subscribing, freezing the connect state until a full app restart.
 */
export function useOnboardingSync(): void {
  useEffect(() => {
    if (started) return;
    started = true;

    const set = useOnboarding.getState().setStatus;

    trpc()
      .onboarding.status.query()
      .then(set)
      .catch(() => {});

    trpc().onboarding.onStatus.subscribe(undefined, {
      onData: set,
      onError: () => {},
    });
  }, []);
}
