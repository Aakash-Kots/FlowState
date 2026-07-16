'use client';

import { WorkspaceView } from '@/lib/enums/view';
import { useWorkspace } from '@/lib/workspace';
import { GitView } from '../git/GitView';
import { LinearView } from '../linear/LinearView';
import { SlackView } from '../slack/SlackView';
import { WorkspaceTabs } from './WorkspaceTabs';

/**
 * The body of a selected worktree: its Claude chat tabs or its git changes
 * manager — following the worktree's `viewMode` (toggled from the header
 * `ViewModeTabs`). Terminals live in the chat view's right-hand panel.
 */
export function WorkspaceViewSwitcher() {
  const viewMode = useWorkspace((s) => s.viewMode);
  switch (viewMode) {
    case WorkspaceView.Git:
      return <GitView />;
    case WorkspaceView.Linear:
      return <LinearView />;
    case WorkspaceView.Slack:
      return <SlackView />;
    default:
      return <WorkspaceTabs />;
  }
}
