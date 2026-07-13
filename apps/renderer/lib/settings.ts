'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { trpc } from './trpc';

///////////
// Types //
///////////

type SettingsState = {
  /** True once preferences have loaded from the main process. */
  hydrated: boolean;
  /** Play a sound when a background agent finishes a turn. */
  soundEnabled: boolean;
};

///////////////
// Constants //
///////////////

const INITIAL: SettingsState = {
  hydrated: false,
  soundEnabled: true,
};

export const useSettings = create<SettingsState>(() => INITIAL);

/////////////
// Helpers //
/////////////

let started = false;

// Sync + actions

/** Load app preferences once for the app's lifetime. */
export function useSettingsSync(): void {
  useEffect(() => {
    if (started) return;
    started = true;
    trpc()
      .settings.get.query()
      .then(({ soundEnabled }) => useSettings.setState({ hydrated: true, soundEnabled }))
      .catch(() => useSettings.setState({ hydrated: true }));
  }, []);
}

/** Toggle the completion sound (optimistic; persisted in the main process). */
export function setSoundEnabled(enabled: boolean): void {
  useSettings.setState({ soundEnabled: enabled });
  void trpc().settings.setSoundEnabled.mutate({ enabled });
}
