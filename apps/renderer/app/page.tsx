'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AppInfo } from '@flowstate/shared';
import { trpc } from '@/lib/trpc';
import { useIsOnboarded, useOnboarding, useOnboardingSync } from '@/lib/onboarding';
import { useWorkspaceSync } from '@/lib/workspace';
import { ConnectScreen } from '@/components/ConnectScreen';
import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { ShortcutProvider } from '@/components/shortcuts/ShortcutProvider';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

export default function Page() {
  // Keep onboarding status live for the whole app and drive the first-run gate.
  useOnboardingSync();
  const hydrated = useOnboarding((s) => s.hydrated);
  const onboarded = useIsOnboarded();

  if (!hydrated) {
    return (
      <main className="flex h-screen items-center justify-center bg-base text-sm text-muted-foreground">
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
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trpc()
      .app.info.query()
      .then(setInfo)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <SidebarProvider className="h-screen">
      <ShortcutProvider>
        <AppSidebar />
        <SidebarInset className="min-h-0">
          <header className="flex items-center justify-between border-b border-edge px-4 py-2.5">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <span className="text-xs text-muted-foreground">claude code workspace</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {info ? (
                <span>
                  {info.name} v{info.version} · {info.platform} ·{' '}
                  <span className="text-success">IPC connected</span>
                </span>
              ) : error ? (
                <span className="text-warn">IPC: {error}</span>
              ) : (
                <span className="text-muted-foreground">connecting to main…</span>
              )}
              <Link
                href="/connect"
                className="text-muted-foreground transition-colors hover:text-neutral-200"
              >
                Connect
              </Link>
            </div>
          </header>

          <WorkspaceTabs />
        </SidebarInset>
      </ShortcutProvider>
    </SidebarProvider>
  );
}
