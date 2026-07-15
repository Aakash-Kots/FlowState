'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { trpc } from './trpc';

type OnboardingStatus = {
  claudeConnected: boolean;
  githubConnected: boolean;
  linearConnected: boolean;
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

let started = false;

/**
 * Subscribe to main-process onboarding status exactly once for the app's
 * lifetime. Seeds from the persisted status query and stays live via the
 * `onStatus` subscription. Mount this near the app root.
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

    const sub = trpc().onboarding.onStatus.subscribe(undefined, {
      onData: set,
      onError: () => {},
    });

    return () => sub.unsubscribe();
  }, []);
}
