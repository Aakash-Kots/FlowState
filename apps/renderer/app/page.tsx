'use client';

import { DEFAULT_WORKSPACE_ID } from '@flowstate/shared';
import { useFullScreenSync } from '@/lib/fullscreen';
import { useIsOnboarded, useOnboarding, useOnboardingSync } from '@/lib/onboarding';
import { useWorktreeSync } from '@/lib/projects';
import { useSettings, useSettingsSync } from '@/lib/settings';
import { useTabStatesSync } from '@/lib/tabStates';
import { useWorkspace, useWorkspaceSync } from '@/lib/workspace';
import { AnalyticsButton } from '@/components/analytics/AnalyticsButton';
import { AnalyticsPage } from '@/components/analytics/AnalyticsPage';
import { ConnectScreen } from '@/components/ConnectScreen';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { SoundToggle } from '@/components/settings/SoundToggle';
import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { ProjectSelector } from '@/components/projects/ProjectSelector';
import { GitHeaderButton } from '@/components/git/GitHeaderButton';
import { SpotifyButton } from '@/components/spotify/SpotifyButton';
import { ShortcutProvider } from '@/components/shortcuts/ShortcutProvider';
import { UsageIndicator } from '@/components/usage/UsageIndicator';
import { ViewModeTabs } from '@/components/workspace/ViewModeTabs';
import { WorkspaceViewSwitcher } from '@/components/workspace/WorkspaceViewSwitcher';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';

export default function Page() {
  // Keep onboarding status live for the whole app and drive the first-run gate.
  useOnboardingSync();
  // Track full-screen so the vibrancy sidebar goes near-opaque (no wallpaper tint).
  useFullScreenSync();
  const hydrated = useOnboarding((s) => s.hydrated);
  const onboarded = useIsOnboarded();

  return (
    <>
      <PageBody hydrated={hydrated} onboarded={onboarded} />
      {/* One toast host for the whole app — worktree remove/archive errors, etc. */}
      <Toaster />
    </>
  );
}

function PageBody({ hydrated, onboarded }: { hydrated: boolean; onboarded: boolean }) {
  if (!hydrated) {
    return (
      <main className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </main>
    );
  }

  // First-run gate: block the workspace until Claude + GitHub are connected.
  if (!onboarded) return <ConnectScreen />;

  return <WorkspaceShell />;
}

/**
 * The command-center shell: a collapsible project sidebar beside the tabbed
 * agent workspace (up to 5 Claude chat tabs per worktree).
 */
function WorkspaceShell() {
  useWorkspaceSync();
  useSettingsSync();
  // Keep every tab's live agent status flowing for the status dots (tab strip
  // + sidebar), not just the active tab.
  useTabStatesSync();
  // Keep the sidebar's worktree names/branches live when a worktree is renamed
  // (auto-title, manual rename, or the in-chat agent renaming its branch).
  useWorktreeSync();
  // No worktree selected (the startup/default state) → land on the project picker
  // instead of the empty default-workspace chat.
  const onDefaultWorkspace = useWorkspace((s) => s.workspaceId) === DEFAULT_WORKSPACE_ID;
  const settingsOpen = useSettings((s) => s.settingsOpen);
  const analyticsOpen = useSettings((s) => s.analyticsOpen);

  return (
    <SidebarProvider className="h-screen">
      <ShortcutProvider>
        <AppSidebar />
        <SidebarInset className="min-h-0 min-w-0">
          <header className="relative flex items-center justify-between border-b border-border bg-secondary px-4 py-2.5">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <UsageIndicator variant="header" />
              {onDefaultWorkspace && (
                <span className="text-xs text-muted-foreground">claude code workspace</span>
              )}
            </div>
            {/* Centered Workspace/Terminals toggle, independent of the side content widths. */}
            {!onDefaultWorkspace && !settingsOpen && !analyticsOpen && (
              <div className="absolute left-1/2 -translate-x-1/2">
                <ViewModeTabs />
              </div>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <AnalyticsButton />
              <SpotifyButton />
              {!onDefaultWorkspace && <GitHeaderButton />}
              <SoundToggle />
            </div>
          </header>

          {analyticsOpen ? (
            <AnalyticsPage />
          ) : settingsOpen ? (
            <SettingsPage />
          ) : onDefaultWorkspace ? (
            <ProjectSelector />
          ) : (
            <WorkspaceViewSwitcher />
          )}
        </SidebarInset>
      </ShortcutProvider>
    </SidebarProvider>
  );
}
