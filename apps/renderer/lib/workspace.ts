'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import {
  ClaudeSessionState,
  DEFAULT_WORKSPACE_ID,
  MAX_TABS_PER_WORKSPACE,
  TabKind,
  type LinearIssueRef,
  type Tab,
} from '@flowstate/shared';
import { WorkspaceView } from './enums/view';
import { clearFileTabState } from './fileTabs';
import { markTabRead, registerTab, unregisterTab, useTabStates } from './tabStates';
import { trpc } from './trpc';

///////////
// Types //
///////////

type WorkspaceState = {
  /** True once the tab list + cwd have been loaded. */
  hydrated: boolean;
  workspaceId: string;
  /** Project working folder shared by every tab (null until one is chosen). */
  cwd: string | null;
  tabs: Tab[];
  activeTabId: string | null;
  /** Which surface the worktree is showing — chat tabs or terminals. */
  viewMode: WorkspaceView;
  /**
   * Freshly-created ticket-linked worktrees still spinning up, keyed by workspace
   * id — drives the "Initialising worktree with ticket …" chat message until the
   * first assistant response arrives.
   */
  initialisingIssue: Record<string, LinearIssueRef>;
  /**
   * The chat tab awaiting a "close while its agent is busy" confirmation, or null
   * when no prompt is open. Drives the `CloseTabConfirmDialog` modal.
   */
  confirmCloseTabId: string | null;
};

///////////////
// Constants //
///////////////

const INITIAL: WorkspaceState = {
  hydrated: false,
  workspaceId: DEFAULT_WORKSPACE_ID,
  cwd: null,
  tabs: [],
  activeTabId: null,
  viewMode: WorkspaceView.Workspace,
  initialisingIssue: {},
  confirmCloseTabId: null,
};

/** Top-level views in cycle order (drives `cycleViewMode`). */
const VIEW_ORDER: WorkspaceView[] = Object.values(WorkspaceView);

export const useWorkspace = create<WorkspaceState>(() => INITIAL);

/////////////
// Helpers //
/////////////

let started = false;

/** Mark a freshly-created ticket-linked worktree as initialising (shows the message). */
export function setInitialising(workspaceId: string, issue: LinearIssueRef): void {
  useWorkspace.setState((s) => ({
    initialisingIssue: { ...s.initialisingIssue, [workspaceId]: issue },
  }));
}

/** Drop a worktree's initialising marker once its first response has landed. */
export function clearInitialising(workspaceId: string): void {
  useWorkspace.setState((s) => {
    if (!s.initialisingIssue[workspaceId]) return {};
    const next = { ...s.initialisingIssue };
    delete next[workspaceId];
    return { initialisingIssue: next };
  });
}

/**
 * Persist the worktree + chat tab now in view so the next reload can reopen it.
 * The default workspace is the "no project selected" state (the picker), so it is
 * never remembered. Fire-and-forget — losing a write only costs a restore.
 */
function rememberActive(workspaceId: string, tabId: string | null): void {
  if (workspaceId === DEFAULT_WORKSPACE_ID) return;
  void trpc().worktree.rememberActive.mutate({ workspaceId, tabId });
}

// Sync + actions

/**
 * Reopen the last-active worktree + chat tab on launch; if none survives, load
 * the default workspace so the project picker shows. Runs once for the app's
 * lifetime.
 */
export function useWorkspaceSync(): void {
  useEffect(() => {
    if (started) return;
    started = true;
    void (async () => {
      const target = await trpc().worktree.lastActive.query();
      if (target) {
        await selectWorkspace(target.workspaceId);
        // Restore the exact chat that was focused (else selectWorkspace's tab 0).
        if (target.tabId) selectTab(target.tabId);
        return;
      }
      const [tabs, cwd] = await Promise.all([
        trpc().tabs.list.query({ workspaceId: DEFAULT_WORKSPACE_ID }),
        trpc().claude.cwd.query({ workspaceId: DEFAULT_WORKSPACE_ID }),
      ]);
      useWorkspace.setState({ hydrated: true, tabs, cwd, activeTabId: tabs[0]?.id ?? null });
    })().catch(() => useWorkspace.setState({ hydrated: true }));
  }, []);
}

/**
 * Switch the active workspace — a project's clone (the default workspace) or one
 * of its worktrees. Loads that workspace's tabs + working folder and focuses its
 * first tab; the top strip and chat follow `workspaceId` automatically.
 */
export async function selectWorkspace(workspaceId: string): Promise<void> {
  if (useWorkspace.getState().workspaceId === workspaceId) return;
  // A fresh worktree always lands on its chat tabs, not whatever the last one showed.
  useWorkspace.setState({
    hydrated: false,
    workspaceId,
    tabs: [],
    activeTabId: null,
    viewMode: WorkspaceView.Workspace,
  });
  try {
    const [tabs, cwd] = await Promise.all([
      trpc().tabs.list.query({ workspaceId }),
      trpc().claude.cwd.query({ workspaceId }),
    ]);
    useWorkspace.setState({
      hydrated: true,
      workspaceId,
      tabs,
      cwd,
      activeTabId: tabs[0]?.id ?? null,
    });
    // Landing on a worktree counts as opening its focused tab.
    if (tabs[0]) markTabRead(tabs[0].id);
    rememberActive(workspaceId, tabs[0]?.id ?? null);
  } catch {
    useWorkspace.setState({ hydrated: true });
  }
}

export function selectTab(tabId: string): void {
  useWorkspace.setState({ activeTabId: tabId });
  markTabRead(tabId);
  rememberActive(useWorkspace.getState().workspaceId, tabId);
}

/** Switch the worktree's top-level surface (chat tabs ↔ git changes). */
export function setViewMode(viewMode: WorkspaceView): void {
  useWorkspace.setState({ viewMode });
  // Returning to the chat surface means you're now looking at the active tab.
  if (viewMode === WorkspaceView.Workspace) {
    const { activeTabId } = useWorkspace.getState();
    if (activeTabId) markTabRead(activeTabId);
  }
}

/**
 * Cycle the worktree's top-level view forward/backward, wrapping around. The
 * order follows the `WorkspaceView` enum, so new sections (e.g. Git review) join
 * the rotation automatically.
 */
export function cycleViewMode(delta: 1 | -1): void {
  const { viewMode } = useWorkspace.getState();
  const i = VIEW_ORDER.indexOf(viewMode);
  const next = VIEW_ORDER[(i + delta + VIEW_ORDER.length) % VIEW_ORDER.length]!;
  setViewMode(next);
}

/** Focus the tab at `index` (0-based), if one exists there. */
export function selectTabByIndex(index: number): void {
  const { tabs } = useWorkspace.getState();
  const tab = tabs[index];
  if (tab) selectTab(tab.id);
}

/** Focus the next/previous tab, wrapping around the ends. */
export function cycleTab(delta: 1 | -1): void {
  const { tabs, activeTabId } = useWorkspace.getState();
  if (tabs.length === 0) return;
  const current = tabs.findIndex((t) => t.id === activeTabId);
  const next = (current + delta + tabs.length) % tabs.length;
  selectTab(tabs[next]!.id);
}

/** Open a new chat tab (up to MAX_TABS_PER_WORKSPACE chat tabs) and focus it. */
export async function openTab(): Promise<void> {
  const { workspaceId, tabs } = useWorkspace.getState();
  if (tabs.filter((t) => t.kind === TabKind.Chat).length >= MAX_TABS_PER_WORKSPACE) return;
  const tab = await trpc().tabs.create.mutate({ workspaceId });
  registerTab(tab.id, workspaceId);
  useWorkspace.setState((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
}

/**
 * Open — or focus, if already open — a file editor tab for a worktree-relative
 * path. Ensures the chat/file strip is the visible surface so the tab shows.
 */
export async function openFileTab(filePath: string): Promise<void> {
  const { workspaceId, tabs, viewMode } = useWorkspace.getState();
  if (viewMode !== WorkspaceView.Workspace) setViewMode(WorkspaceView.Workspace);
  const existing = tabs.find((t) => t.kind === TabKind.File && t.filePath === filePath);
  if (existing) {
    selectTab(existing.id);
    return;
  }
  const title = filePath.split('/').pop() || filePath;
  const tab = await trpc().tabs.create.mutate({
    workspaceId,
    kind: TabKind.File,
    filePath,
    title,
  });
  registerTab(tab.id, workspaceId);
  useWorkspace.setState((s) => ({ tabs: [...s.tabs, tab] }));
  selectTab(tab.id);
}

/**
 * Close a tab, focusing a neighbor if it was active. File tabs always close;
 * a chat tab won't close if it's the workspace's last chat tab. A chat tab whose
 * agent is still working (`Running`) or waiting on input (`Waiting`) opens a
 * confirmation modal instead of closing outright — the confirm path runs
 * `performCloseTab` via `confirmCloseTab`.
 */
export async function closeTab(tabId: string): Promise<void> {
  const { tabs } = useWorkspace.getState();
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;
  if (tab.kind === TabKind.Chat && tabs.filter((t) => t.kind === TabKind.Chat).length <= 1) return;
  const state = useTabStates.getState().states[tabId] ?? ClaudeSessionState.Idle;
  if (state === ClaudeSessionState.Running || state === ClaudeSessionState.Waiting) {
    useWorkspace.setState({ confirmCloseTabId: tabId });
    return;
  }
  await performCloseTab(tabId);
}

/** The actual close mechanics, run once any busy-agent confirmation has passed. */
async function performCloseTab(tabId: string): Promise<void> {
  const { tabs, activeTabId } = useWorkspace.getState();
  await trpc().tabs.close.mutate({ tabId });
  unregisterTab(tabId);
  clearFileTabState(tabId);
  const remaining = tabs.filter((t) => t.id !== tabId);
  const nextActive =
    activeTabId === tabId ? (remaining[remaining.length - 1]?.id ?? null) : activeTabId;
  useWorkspace.setState({ tabs: remaining, activeTabId: nextActive });
}

/** Dismiss the close-confirmation modal, leaving the tab open. */
export function cancelCloseTab(): void {
  useWorkspace.setState({ confirmCloseTabId: null });
}

/** Confirm closing the tab that was awaiting confirmation, then close it. */
export function confirmCloseTab(): void {
  const { confirmCloseTabId } = useWorkspace.getState();
  if (!confirmCloseTabId) return;
  useWorkspace.setState({ confirmCloseTabId: null });
  void performCloseTab(confirmCloseTabId);
}

/** Rename a tab. */
export async function renameTab(tabId: string, title: string): Promise<void> {
  const updated = await trpc().tabs.rename.mutate({ tabId, title });
  useWorkspace.setState((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? updated : t)) }));
}

/** Open the native folder picker; on choose, update the project's cwd. */
export async function pickWorkingFolder(): Promise<void> {
  const { workspaceId } = useWorkspace.getState();
  const { cwd } = await trpc().claude.pickCwd.mutate({ workspaceId });
  if (cwd) useWorkspace.setState({ cwd });
}
