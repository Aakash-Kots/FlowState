'use client';

import { create } from 'zustand';

/////////////
// Helpers //
/////////////

/** Whether a path renders as Markdown (drives the preview affordance). */
export function isMarkdownPath(path: string | null | undefined): boolean {
  return path != null && /\.(md|markdown)$/i.test(path);
}

///////////
// Types //
///////////

type FileTabsState = {
  /** Per-file-tab unsaved-changes flag, keyed by tab id. */
  dirty: Record<string, boolean>;
  /**
   * Per-Markdown-tab rendered-preview flag, keyed by tab id. Absent means the
   * default — Markdown tabs open in preview, so a missing entry reads as `true`.
   */
  preview: Record<string, boolean>;
};

export const useFileTabs = create<FileTabsState>(() => ({ dirty: {}, preview: {} }));

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

/** Flip a Markdown file tab between rendered preview and source. */
export function toggleFileTabPreview(tabId: string): void {
  useFileTabs.setState((s) => ({
    preview: { ...s.preview, [tabId]: !(s.preview[tabId] ?? true) },
  }));
}

/** Forget a tab's view/dirty state entirely (on close). */
export function clearFileTabState(tabId: string): void {
  useFileTabs.setState((s) => {
    if (!(tabId in s.dirty) && !(tabId in s.preview)) return s;
    const dirty = { ...s.dirty };
    const preview = { ...s.preview };
    delete dirty[tabId];
    delete preview[tabId];
    return { dirty, preview };
  });
}

///////////////
// Selectors //
///////////////

/** Whether a file tab has unsaved edits. */
export function useFileTabDirty(tabId: string): boolean {
  return useFileTabs((s) => Boolean(s.dirty[tabId]));
}

/** Whether a Markdown file tab is showing the rendered preview (defaults on). */
export function useFileTabPreview(tabId: string): boolean {
  return useFileTabs((s) => s.preview[tabId] ?? true);
}
