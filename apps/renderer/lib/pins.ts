'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { PinnedItemKind, type PinnedItem } from '@flowstate/shared';
import { toast } from '@/components/ui/sonner';
import { trpc } from './trpc';

///////////
// Types //
///////////

type PinsState = {
  /** True once the active worktree's pins have loaded. */
  hydrated: boolean;
  /** The workspace whose pins are currently loaded (guards stale responses). */
  workspaceId: string | null;
  /** Worktree-scoped pins (this worktree only). */
  worktree: PinnedItem[];
  /** Repo-scoped pins (shared by every worktree of the project). */
  repo: PinnedItem[];
};

///////////////
// Constants //
///////////////

const INITIAL: PinsState = {
  hydrated: false,
  workspaceId: null,
  worktree: [],
  repo: [],
};

export const usePins = create<PinsState>(() => INITIAL);

// Sync + actions

/**
 * Load the active worktree's pins (its own plus its repo's) whenever the
 * worktree or project changes. Unlike most sync hooks this has no once-guard:
 * the pins are per-scope, so switching worktrees must refetch.
 */
export function usePinsSync(workspaceId: string, projectId: string | null): void {
  useEffect(() => {
    let cancelled = false;
    usePins.setState({ hydrated: false });
    trpc()
      .pins.list.query({ workspaceId, projectId })
      .then(({ worktree, repo }) => {
        if (!cancelled) usePins.setState({ hydrated: true, workspaceId, worktree, repo });
      })
      .catch(() => {
        if (!cancelled) usePins.setState({ hydrated: true, workspaceId, worktree: [], repo: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, projectId]);
}

/**
 * Pin a skill or action to the current worktree or its repo. Pass exactly one of
 * `workspaceId` / `projectId`; the new pin is appended to the matching list.
 */
export async function pinItem(input: {
  workspaceId: string | null;
  projectId: string | null;
  kind: PinnedItemKind;
  ref: string;
  label: string;
}): Promise<void> {
  const item = await trpc().pins.pin.mutate(input);
  usePins.setState((s) =>
    item.workspaceId ? { worktree: [...s.worktree, item] } : { repo: [...s.repo, item] },
  );
}

/**
 * Import a skill `.md` from elsewhere into the current worktree: the main
 * process copies it into `.claude/skills/`, commits + pushes it, refreshes the
 * session, and pins it. The returned pin is appended to the worktree list; a
 * push failure is surfaced as a warning (the copy + pin still stand).
 */
export async function importSkill(input: {
  workspaceId: string;
  tabId: string;
  sourcePath: string;
}): Promise<void> {
  try {
    const { pin, pushError } = await trpc().skills.import.mutate(input);
    usePins.setState((s) => ({ worktree: [...s.worktree, pin] }));
    if (pushError) {
      toast.warning(`Imported ${pin.label}, but couldn't push`, { description: pushError });
    }
  } catch (err) {
    toast.error("Couldn't import skill", {
      description: err instanceof Error ? err.message : 'Import failed.',
    });
  }
}

/** Remove a pin (optimistic: drop it from both lists, then persist). */
export async function unpinItem(id: string): Promise<void> {
  usePins.setState((s) => ({
    worktree: s.worktree.filter((p) => p.id !== id),
    repo: s.repo.filter((p) => p.id !== id),
  }));
  await trpc().pins.unpin.mutate({ id });
}
