'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import { DEFAULT_WORKSPACE_ID } from '@flowstate/shared';
import { useIsOnboarded, useOnboarding, useOnboardingSync } from '@/lib/onboarding';
import { setSettingsOpen, useSettings, useSettingsSync } from '@/lib/settings';
import { useTabStatesSync } from '@/lib/tabStates';
import { useWorkspace, useWorkspaceSync } from '@/lib/workspace';
import { ConnectScreen } from '@/components/ConnectScreen';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { SoundToggle } from '@/components/settings/SoundToggle';
import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { ProjectSelector } from '@/components/projects/ProjectSelector';
import { GitHeaderButton } from '@/components/git/GitHeaderButton';
import { ShortcutProvider } from '@/components/shortcuts/ShortcutProvider';
import { ViewModeTabs } from '@/components/workspace/ViewModeTabs';
import { WorkspaceViewSwitcher } from '@/components/workspace/WorkspaceViewSwitcher';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/components/ui/cn';

export default function Page() {
  // Keep onboarding status live for the whole app and drive the first-run gate.
  useOnboardingSync();
  const hydrated = useOnboarding((s) => s.hydrated);
  const onboarded = useIsOnboarded();

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
  // No worktree selected (the startup/default state) → land on the project picker
  // instead of the empty default-workspace chat.
  const onDefaultWorkspace = useWorkspace((s) => s.workspaceId) === DEFAULT_WORKSPACE_ID;
  const settingsOpen = useSettings((s) => s.settingsOpen);

  return (
    <SidebarProvider className="h-screen">
      <ShortcutProvider>
        <AppSidebar />
        <SidebarInset className="min-h-0 min-w-0">
          <header className="relative flex items-center justify-between border-b border-border bg-secondary px-4 py-2.5">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              {onDefaultWorkspace && (
                <span className="text-xs text-muted-foreground">claude code workspace</span>
              )}
            </div>
            {/* Centered Workspace/Terminals toggle, independent of the side content widths. */}
            {!onDefaultWorkspace && !settingsOpen && (
              <div className="absolute left-1/2 -translate-x-1/2">
                <ViewModeTabs />
              </div>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {!onDefaultWorkspace && <GitHeaderButton />}
              <SoundToggle />
              <button
                type="button"
                onClick={() => setSettingsOpen(!settingsOpen)}
                title="Settings"
                aria-pressed={settingsOpen}
                className={cn(
                  'transition-colors hover:text-neutral-200',
                  settingsOpen ? 'text-neutral-200' : 'text-muted-foreground',
                )}
              >
                <Settings className="size-4" />
                <span className="sr-only">Settings</span>
              </button>
              <Link
                href="/connect"
                className="text-muted-foreground transition-colors hover:text-neutral-200"
              >
                Connect
              </Link>
            </div>
          </header>

          {settingsOpen ? (
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
