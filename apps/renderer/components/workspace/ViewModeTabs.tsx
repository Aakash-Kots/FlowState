'use client';

import { WorkspaceView } from '@/lib/enums/view';
import { useOnboarding } from '@/lib/onboarding';
import { setViewMode, useWorkspace } from '@/lib/workspace';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';

/**
 * The top-level Workspace / Git / Linear toggle for a selected worktree, shown in
 * the app header. Switches the worktree's `viewMode`; the body follows via
 * `WorkspaceViewSwitcher`. The Linear tab appears only when Linear is connected.
 */
export function ViewModeTabs() {
  const viewMode = useWorkspace((s) => s.viewMode);
  const linearConnected = useOnboarding((s) => s.linearConnected);
  return (
    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as WorkspaceView)}>
      <TabsList className="h-7 p-0.5">
        <TabsTrigger value={WorkspaceView.Workspace} className="h-6 px-2.5 text-xs">
          Workspace
        </TabsTrigger>
        <TabsTrigger value={WorkspaceView.Git} className="h-6 px-2.5 text-xs">
          Git
        </TabsTrigger>
        {linearConnected && (
          <TabsTrigger value={WorkspaceView.Linear} className="h-6 px-2.5 text-xs">
            Linear
          </TabsTrigger>
        )}
      </TabsList>
    </Tabs>
  );
}
