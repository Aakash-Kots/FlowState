'use client';

import { WorkspaceView } from '@/lib/enums/view';
import { useWorkspace } from '@/lib/workspace';
import { TerminalTabs } from '../terminal/TerminalTabs';
import { WorkspaceTabs } from './WorkspaceTabs';

/**
 * The body of a selected worktree: its Claude chat tabs or its terminals,
 * following the worktree's `viewMode` (toggled from the header `ViewModeTabs`).
 */
export function WorkspaceViewSwitcher() {
  const viewMode = useWorkspace((s) => s.viewMode);
  return viewMode === WorkspaceView.Terminals ? <TerminalTabs /> : <WorkspaceTabs />;
}
