'use client';

import { create } from 'zustand';

///////////
// Types //
///////////

type FileTabsState = {
  /** Per-file-tab unsaved-changes flag, keyed by tab id. */
  dirty: Record<string, boolean>;
};

export const useFileTabs = create<FileTabsState>(() => ({ dirty: {} }));

/////////////
// Actions //
/////////////

/** Flag (or clear) a file tab's unsaved-changes state. */
export function setFileTabDirty(tabId: string, dirty: boolean): void {
  useFileTabs.setState((s) => {
    if (Boolean(s.dirty[tabId]) === dirty) return s;
    const next = { ...s.dirty };
    if (dirty) next[tabId] = true;
    else delete next[tabId];
    return { dirty: next };
  });
}

/** Drop a file tab's dirty entry entirely (on save or close). */
export function clearFileTabDirty(tabId: string): void {
  setFileTabDirty(tabId, false);
}

///////////////
// Selectors //
///////////////

/** Whether a file tab has unsaved edits. */
export function useFileTabDirty(tabId: string): boolean {
  return useFileTabs((s) => Boolean(s.dirty[tabId]));
}
