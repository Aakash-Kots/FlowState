'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AppInfo } from '@flowstate/shared';
import { trpc } from '@/lib/trpc';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { ConnectScreen } from '@/components/ConnectScreen';
import { useIsOnboarded, useOnboarding, useOnboardingSync } from '@/lib/onboarding';

export default function Page() {
  // Keep onboarding status live for the whole app and drive the first-run gate.
  useOnboardingSync();
  const hydrated = useOnboarding((s) => s.hydrated);
  const onboarded = useIsOnboarded();

  if (!hydrated) {
    return (
      <main className="flex h-screen items-center justify-center bg-base text-sm text-muted">
        Loading…
      </main>
    );
  }

  // First-run gate: block the workspace until Claude + GitHub are connected.
  if (!onboarded) return <ConnectScreen />;

  return <WorkspaceShell />;
}

/**
 * The workspace is a single full-screen Claude Code session: app header on
 * top, then the chat (streamed via the Agent SDK in the main process).
 */
function WorkspaceShell() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trpc()
      .app.info.query()
      .then(setInfo)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-edge px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-wide text-accent">FlowState</h1>
          <span className="text-xs text-muted">claude code workspace</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          {info ? (
            <span>
              {info.name} v{info.version} · {info.platform} ·{' '}
              <span className="text-success">IPC connected</span>
            </span>
          ) : error ? (
            <span className="text-warn">IPC: {error}</span>
          ) : (
            <span className="text-muted">connecting to main…</span>
          )}
          <Link href="/connect" className="text-muted transition-colors hover:text-neutral-200">
            Connect
          </Link>
        </div>
      </header>

      <ChatWorkspace />
    </main>
  );
}
