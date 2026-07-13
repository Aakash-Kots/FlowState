'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { DEFAULT_WORKSPACE_ID, MAX_TABS_PER_WORKSPACE, type Tab } from '@flowstate/shared';
import { WorkspaceView } from './enums/view';
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
};

/** Top-level views in cycle order (drives `cycleViewMode`). */
const VIEW_ORDER: WorkspaceView[] = Object.values(WorkspaceView);

export const useWorkspace = create<WorkspaceState>(() => INITIAL);

/////////////
// Helpers //
/////////////

let started = false;

// Sync + actions

/**
 * Load the workspace's tabs (seeding a default one) and working folder once for
 * the app's lifetime, then focus the first tab.
 */
export function useWorkspaceSync(): void {
  useEffect(() => {
    if (started) return;
    started = true;
    void (async () => {
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
    useWorkspace.setState({ hydrated: true, workspaceId, tabs, cwd, activeTabId: tabs[0]?.id ?? null });
  } catch {
    useWorkspace.setState({ hydrated: true });
  }
}

export function selectTab(tabId: string): void {
  useWorkspace.setState({ activeTabId: tabId });
}

/** Switch the worktree's top-level surface (chat tabs ↔ terminals). */
export function setViewMode(viewMode: WorkspaceView): void {
  useWorkspace.setState({ viewMode });
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

/** Open a new tab (up to MAX_TABS_PER_WORKSPACE) and focus it. */
export async function openTab(): Promise<void> {
  const { workspaceId, tabs } = useWorkspace.getState();
  if (tabs.length >= MAX_TABS_PER_WORKSPACE) return;
  const tab = await trpc().tabs.create.mutate({ workspaceId });
  useWorkspace.setState((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
}

/** Close a tab, focusing a neighbor if it was active. Never closes the last tab. */
export async function closeTab(tabId: string): Promise<void> {
  const { tabs, activeTabId } = useWorkspace.getState();
  if (tabs.length <= 1) return;
  await trpc().tabs.close.mutate({ tabId });
  const remaining = tabs.filter((t) => t.id !== tabId);
  const nextActive =
    activeTabId === tabId ? (remaining[remaining.length - 1]?.id ?? null) : activeTabId;
  useWorkspace.setState({ tabs: remaining, activeTabId: nextActive });
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
