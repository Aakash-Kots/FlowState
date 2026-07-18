'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { DEFAULT_WORKSPACE_ID } from '@flowstate/shared';
import { NoteScope } from './enums/notes';
import { trpc } from './trpc';

///////////
// Types //
///////////

type NotesState = {
  /** True once the active scope's pads have loaded. */
  hydrated: boolean;
  /** The worktree whose pad is currently loaded (guards stale responses). */
  workspaceId: string | null;
  /** The app-wide Global pad's Markdown. */
  global: string;
  /** The active worktree's pad Markdown (empty on the default workspace). */
  worktree: string;
};

///////////////
// Constants //
///////////////

const INITIAL: NotesState = {
  hydrated: false,
  workspaceId: null,
  global: '',
  worktree: '',
};

/** Debounce window before an edited pad is persisted. */
const SAVE_DEBOUNCE_MS = 400;

export const useNotes = create<NotesState>(() => INITIAL);

/////////////
// Helpers //
/////////////

/** The API `workspaceId` for a scope: null for Global, the worktree id otherwise. */
function scopeId(scope: NoteScope, workspaceId: string): string | null {
  return scope === NoteScope.Global ? null : workspaceId;
}

const saveTimers: Record<NoteScope, ReturnType<typeof setTimeout> | null> = {
  [NoteScope.Global]: null,
  [NoteScope.Worktree]: null,
};

// Sync + actions

/**
 * Load the Global pad and the active worktree's pad whenever the worktree
 * changes. Like the pins sync this has no once-guard — switching worktrees must
 * refetch the worktree pad. The worktree fetch is skipped on the default
 * workspace (no project selected), where only the Global pad is shown.
 */
export function useNotesSync(workspaceId: string): void {
  useEffect(() => {
    let cancelled = false;
    useNotes.setState({ hydrated: false });
    const onDefault = workspaceId === DEFAULT_WORKSPACE_ID;
    Promise.all([
      trpc().notes.get.query({ workspaceId: null }),
      onDefault ? Promise.resolve(null) : trpc().notes.get.query({ workspaceId }),
    ])
      .then(([global, worktree]) => {
        if (cancelled) return;
        useNotes.setState({
          hydrated: true,
          workspaceId,
          global: global?.body ?? '',
          worktree: worktree?.body ?? '',
        });
      })
      .catch(() => {
        if (!cancelled)
          useNotes.setState({ hydrated: true, workspaceId, global: '', worktree: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);
}

/**
 * Update a scope's pad in the store and persist it (debounced). The Markdown is
 * held locally so typing stays instant; the write lands `SAVE_DEBOUNCE_MS` after
 * the last keystroke.
 */
export function saveNote(scope: NoteScope, workspaceId: string, body: string): void {
  useNotes.setState(scope === NoteScope.Global ? { global: body } : { worktree: body });
  const timer = saveTimers[scope];
  if (timer) clearTimeout(timer);
  saveTimers[scope] = setTimeout(() => {
    saveTimers[scope] = null;
    void trpc().notes.save.mutate({ workspaceId: scopeId(scope, workspaceId), body });
  }, SAVE_DEBOUNCE_MS);
}

/** Flush any pending debounced saves immediately (e.g. when the pad closes). */
export function flushNoteSave(workspaceId: string): void {
  [NoteScope.Global, NoteScope.Worktree].forEach((scope) => {
    const timer = saveTimers[scope];
    if (!timer) return;
    clearTimeout(timer);
    saveTimers[scope] = null;
    const { global, worktree } = useNotes.getState();
    void trpc().notes.save.mutate({
      workspaceId: scopeId(scope, workspaceId),
      body: scope === NoteScope.Global ? global : worktree,
    });
  });
}
