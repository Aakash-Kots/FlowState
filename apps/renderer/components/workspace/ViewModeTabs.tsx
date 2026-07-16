'use client';

import { WorkspaceView } from '@/lib/enums/view';
import { useOnboarding } from '@/lib/onboarding';
import { useSlackMentionsBadge, useUnreadMentionCount } from '@/lib/slack';
import { setViewMode, useWorkspace } from '@/lib/workspace';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';

/**
 * The top-level Workspace / Git / Linear / Slack toggle for a selected worktree,
 * shown in the app header. Switches the worktree's `viewMode`; the body follows
 * via `WorkspaceViewSwitcher`. The Linear and Slack tabs appear only when their
 * integration is connected. The Slack tab carries an unread @-mention badge kept
 * live by `useSlackMentionsBadge` (this strip lives in the header the whole time a
 * worktree is open).
 */
export function ViewModeTabs() {
  const viewMode = useWorkspace((s) => s.viewMode);
  const linearConnected = useOnboarding((s) => s.linearConnected);
  const slackConnected = useOnboarding((s) => s.slackConnected);
  const unreadMentions = useUnreadMentionCount();

  useSlackMentionsBadge();

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
        {slackConnected && (
          <TabsTrigger value={WorkspaceView.Slack} className="h-6 gap-1.5 px-2.5 text-xs">
            Slack
            {unreadMentions > 0 && (
              <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                {unreadMentions > 99 ? '99+' : unreadMentions}
              </span>
            )}
          </TabsTrigger>
        )}
      </TabsList>
    </Tabs>
  );
}
