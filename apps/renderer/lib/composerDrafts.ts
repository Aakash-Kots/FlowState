'use client';

import { create } from 'zustand';
import type { ComposerDraft } from '@/lib/types/chat';

///////////
// Types //
///////////

type ComposerDraftsState = {
  /** Per-chat-tab unsent composer draft (text + image pills), keyed by tab id. */
  drafts: Record<string, ComposerDraft>;
};

export const useComposerDrafts = create<ComposerDraftsState>(() => ({ drafts: {} }));

/////////////
// Actions //
/////////////

/** Read a tab's saved draft (an empty draft when none has been stored yet). */
export function getComposerDraft(tabId: string): ComposerDraft {
  return useComposerDrafts.getState().drafts[tabId] ?? { text: '', images: [] };
}

/** Store a tab's draft, or drop the entry entirely once the draft goes empty. */
export function setComposerDraft(tabId: string, draft: ComposerDraft): void {
  useComposerDrafts.setState((s) => {
    if (draft.text.length === 0 && draft.images.length === 0) {
      if (!(tabId in s.drafts)) return s;
      const next = { ...s.drafts };
      delete next[tabId];
      return { drafts: next };
    }
    return { drafts: { ...s.drafts, [tabId]: draft } };
  });
}

/** Forget a tab's draft entirely (on send, `/clear`, or tab close). */
export function clearComposerDraft(tabId: string): void {
  useComposerDrafts.setState((s) => {
    if (!(tabId in s.drafts)) return s;
    const next = { ...s.drafts };
    delete next[tabId];
    return { drafts: next };
  });
}
