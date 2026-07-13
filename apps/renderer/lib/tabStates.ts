'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { ClaudeSessionState, type TabStateChange } from '@flowstate/shared';
import { WorkspaceView } from './enums/view';
import { trpc } from './trpc';
import { useWorkspace } from './workspace';

///////////
// Types //
///////////

type TabStatesState = {
  /** Live Claude session state per tab id, across every workspace. */
  states: Record<string, ClaudeSessionState>;
  /** Which workspace each tab belongs to — lets the worktree aggregate group tabs. */
  workspaceOf: Record<string, string>;
  /**
   * Tabs that finished a turn while the user wasn't looking (local, in-memory —
   * a fresh session starts with everything read). Cleared when the tab is opened.
   */
  unread: Record<string, boolean>;
};

///////////////
// Constants //
///////////////

/**
 * Worktree-row urgency order (index 0 = most urgent). A worktree's dot shows the
 * most urgent state across its tabs, so "needs input" always wins over "working".
 */
const PRIORITY: ClaudeSessionState[] = [
  ClaudeSessionState.Waiting,
  ClaudeSessionState.Running,
  ClaudeSessionState.Error,
  ClaudeSessionState.Idle,
];

export const useTabStates = create<TabStatesState>(() => ({
  states: {},
  workspaceOf: {},
  unread: {},
}));

/////////////
// Helpers //
/////////////

/** True when the user is actively looking at `tabId` right now (so it's read). */
function isViewing(tabId: string, workspaceId: string): boolean {
  const { workspaceId: activeWs, activeTabId, viewMode } = useWorkspace.getState();
  return (
    workspaceId === activeWs &&
    tabId === activeTabId &&
    viewMode === WorkspaceView.Workspace &&
    typeof document !== 'undefined' &&
    document.hasFocus()
  );
}

/** Fold one state transition into the store, flagging unread on a finished turn. */
function apply(change: TabStateChange): void {
  useTabStates.setState((s) => {
    const prev = s.states[change.tabId];
    // The turn-complete edge (mirrors the finish ping): Running/Waiting → Idle.
    const finished =
      (prev === ClaudeSessionState.Running || prev === ClaudeSessionState.Waiting) &&
      change.state === ClaudeSessionState.Idle;
    const unread =
      finished && !isViewing(change.tabId, change.workspaceId)
        ? { ...s.unread, [change.tabId]: true }
        : s.unread;
    return {
      states: { ...s.states, [change.tabId]: change.state },
      workspaceOf: { ...s.workspaceOf, [change.tabId]: change.workspaceId },
      unread,
    };
  });
}

/** The most urgent state among a worktree's tabs. */
function aggregate(states: ClaudeSessionState[]): ClaudeSessionState {
  let best = ClaudeSessionState.Idle;
  for (const state of states) {
    if (PRIORITY.indexOf(state) < PRIORITY.indexOf(best)) best = state;
  }
  return best;
}

// Sync + actions

let started = false;

/**
 * Bind the app-wide status map once for the app's lifetime: subscribe first
 * (buffering), seed the persisted baseline, then replay the buffer so a live
 * transition during startup always wins over the older persisted value. Mirrors
 * `useChatSync`'s subscribe/hydrate race handling; no cleanup by design.
 */
export function useTabStatesSync(): void {
  useEffect(() => {
    if (started) return;
    started = true;

    let seeded = false;
    const buffer: TabStateChange[] = [];

    trpc().claude.onAnyState.subscribe(undefined, {
      onData: (change) => {
        if (seeded) apply(change);
        else buffer.push(change);
      },
      onError: () => {},
    });

    trpc()
      .tabs.states.query()
      .then((rows) => {
        for (const row of rows) apply(row);
        for (const change of buffer) apply(change);
        seeded = true;
        buffer.length = 0;
      })
      .catch(() => {
        seeded = true;
      });

    // Returning to the app clears the tab you land back on — you're now looking
    // at it, so whatever finished while you were away is no longer unread.
    window.addEventListener('focus', () => {
      const { activeTabId, viewMode } = useWorkspace.getState();
      if (activeTabId && viewMode === WorkspaceView.Workspace) markTabRead(activeTabId);
    });
  }, []);
}

/** Track a freshly-opened tab (seeds Idle) so the maps don't lag the UI. */
export function registerTab(tabId: string, workspaceId: string): void {
  apply({ tabId, workspaceId, state: ClaudeSessionState.Idle });
}

/** Drop a closed tab so its (possibly non-idle) state stops skewing aggregates. */
export function unregisterTab(tabId: string): void {
  useTabStates.setState((s) => {
    const states = { ...s.states };
    const workspaceOf = { ...s.workspaceOf };
    const unread = { ...s.unread };
    delete states[tabId];
    delete workspaceOf[tabId];
    delete unread[tabId];
    return { states, workspaceOf, unread };
  });
}

/** Clear a tab's unread flag — called when the user opens/looks at it. */
export function markTabRead(tabId: string): void {
  useTabStates.setState((s) => {
    if (!s.unread[tabId]) return {};
    const unread = { ...s.unread };
    delete unread[tabId];
    return { unread };
  });
}

// Selectors

/** A tab's live session state (Idle until its first transition/seed). */
export function useTabState(tabId: string): ClaudeSessionState {
  return useTabStates((s) => s.states[tabId] ?? ClaudeSessionState.Idle);
}

/** Whether a tab finished unseen. */
export function useTabUnread(tabId: string): boolean {
  return useTabStates((s) => s.unread[tabId] ?? false);
}

/** The aggregate (most-urgent) state across a worktree's tabs. */
export function useWorktreeState(workspaceId: string): ClaudeSessionState {
  return useTabStates((s) => {
    const states: ClaudeSessionState[] = [];
    for (const [tabId, ws] of Object.entries(s.workspaceOf)) {
      if (ws === workspaceId) states.push(s.states[tabId] ?? ClaudeSessionState.Idle);
    }
    return aggregate(states);
  });
}

/** Whether any of a worktree's tabs finished unseen. */
export function useWorktreeUnread(workspaceId: string): boolean {
  return useTabStates((s) =>
    Object.entries(s.workspaceOf).some(([tabId, ws]) => ws === workspaceId && s.unread[tabId]),
  );
}
