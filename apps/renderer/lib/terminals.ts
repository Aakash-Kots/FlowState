'use client';

import { create } from 'zustand';
import { MAX_TERMINALS_PER_WORKSPACE, TerminalKind, type TerminalTab } from '@flowstate/shared';
import { trpc } from './trpc';

///////////
// Types //
///////////

type TerminalsState = {
  /** The workspace whose terminals are currently loaded (null before first load). */
  workspaceId: string | null;
  /** True once this workspace's terminal tabs have been loaded. */
  hydrated: boolean;
  terminalTabs: TerminalTab[];
  activeTerminalTabId: string | null;
};

export const useTerminals = create<TerminalsState>(() => ({
  workspaceId: null,
  hydrated: false,
  terminalTabs: [],
  activeTerminalTabId: null,
}));

/////////////
// Helpers //
/////////////

/** Shell tabs count toward the cap; the Setup/Run defaults do not. */
function shellCount(tabs: TerminalTab[]): number {
  return tabs.filter((t) => t.kind === TerminalKind.Shell).length;
}

// Sync + actions

/**
 * Load a workspace's terminal tabs (seeding the Setup/Run defaults on the main
 * side) and focus the first one. A no-op if that workspace is already loaded, so
 * toggling between the Workspace and Terminals views keeps the active terminal.
 */
export async function loadTerminals(workspaceId: string): Promise<void> {
  if (useTerminals.getState().workspaceId === workspaceId) return;
  useTerminals.setState({
    workspaceId,
    hydrated: false,
    terminalTabs: [],
    activeTerminalTabId: null,
  });
  try {
    const terminalTabs = await trpc().terminal.listTabs.query({ workspaceId });
    // Guard against an out-of-order response after another workspace was selected.
    if (useTerminals.getState().workspaceId !== workspaceId) return;
    useTerminals.setState({
      hydrated: true,
      terminalTabs,
      activeTerminalTabId: terminalTabs[0]?.id ?? null,
    });
  } catch {
    useTerminals.setState({ hydrated: true });
  }
}

/** Re-fetch the active workspace's terminal tabs (e.g. after a script edit). */
export async function refreshTerminals(): Promise<void> {
  const { workspaceId } = useTerminals.getState();
  if (!workspaceId) return;
  try {
    const terminalTabs = await trpc().terminal.listTabs.query({ workspaceId });
    if (useTerminals.getState().workspaceId !== workspaceId) return;
    useTerminals.setState((s) => ({
      terminalTabs,
      activeTerminalTabId:
        terminalTabs.find((t) => t.id === s.activeTerminalTabId)?.id ?? terminalTabs[0]?.id ?? null,
    }));
  } catch {
    // Non-fatal: the strip simply keeps the tabs it already had.
  }
}

export function selectTerminal(tabId: string): void {
  useTerminals.setState({ activeTerminalTabId: tabId });
}

/** Focus the next/previous terminal tab, wrapping around the ends. */
export function cycleTerminal(delta: 1 | -1): void {
  const { terminalTabs, activeTerminalTabId } = useTerminals.getState();
  if (terminalTabs.length === 0) return;
  const current = terminalTabs.findIndex((t) => t.id === activeTerminalTabId);
  const next = (current + delta + terminalTabs.length) % terminalTabs.length;
  selectTerminal(terminalTabs[next]!.id);
}

/** Open a new shell terminal (up to MAX_TERMINALS_PER_WORKSPACE) and focus it. */
export async function openTerminal(): Promise<void> {
  const { workspaceId, terminalTabs } = useTerminals.getState();
  if (!workspaceId || shellCount(terminalTabs) >= MAX_TERMINALS_PER_WORKSPACE) return;
  const tab = await trpc().terminal.createTab.mutate({ workspaceId });
  useTerminals.setState((s) => ({
    terminalTabs: [...s.terminalTabs, tab],
    activeTerminalTabId: tab.id,
  }));
}

/** Close a shell terminal, focusing a neighbor if it was active. Defaults can't be closed. */
export async function closeTerminal(tabId: string): Promise<void> {
  const { terminalTabs, activeTerminalTabId } = useTerminals.getState();
  const tab = terminalTabs.find((t) => t.id === tabId);
  if (!tab || tab.kind !== TerminalKind.Shell) return;
  await trpc().terminal.closeTab.mutate({ tabId });
  const remaining = terminalTabs.filter((t) => t.id !== tabId);
  const nextActive =
    activeTerminalTabId === tabId
      ? (remaining[remaining.length - 1]?.id ?? null)
      : activeTerminalTabId;
  useTerminals.setState({ terminalTabs: remaining, activeTerminalTabId: nextActive });
}

/** Rename a terminal tab. */
export async function renameTerminal(tabId: string, title: string): Promise<void> {
  const updated = await trpc().terminal.renameTab.mutate({ tabId, title });
  useTerminals.setState((s) => ({
    terminalTabs: s.terminalTabs.map((t) => (t.id === tabId ? updated : t)),
  }));
}
