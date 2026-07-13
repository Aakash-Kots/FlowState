'use client';

import { WorkspaceView } from '@/lib/enums/view';
import { useWorkspace } from '@/lib/workspace';
import { GitView } from '../git/GitView';
import { TerminalTabs } from '../terminal/TerminalTabs';
import { WorkspaceTabs } from './WorkspaceTabs';

/**
 * The body of a selected worktree: its Claude chat tabs, its git changes
 * manager, or its terminals — following the worktree's `viewMode` (toggled from
 * the header `ViewModeTabs`).
 */
export function WorkspaceViewSwitcher() {
  const viewMode = useWorkspace((s) => s.viewMode);
  switch (viewMode) {
    case WorkspaceView.Git:
      return <GitView />;
    case WorkspaceView.Terminals:
      return <TerminalTabs />;
    default:
      return <WorkspaceTabs />;
  }
}
