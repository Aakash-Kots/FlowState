'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AppInfo } from '@flowstate/shared';
import { trpc } from '@/lib/trpc';
import { ConnectScreen } from '@/components/ConnectScreen';
import { TerminalView } from '@/components/TerminalView';
import { useIsOnboarded, useOnboarding, useOnboardingSync } from '@/lib/onboarding';

const PANELS = [
  { key: 'git', title: 'Git', hint: 'Status, diff, commit, push' },
  { key: 'terminal', title: 'Terminal', hint: 'Integrated pty tabs' },
  { key: 'claude', title: 'Claude Code', hint: 'Agent session for this worktree' },
  { key: 'linear', title: 'Linear', hint: 'Assigned issues & status' },
] as const;

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

  // First-run gate: block the workspace shell until Claude + GitHub are connected.
  if (!onboarded) return <ConnectScreen />;

  return <WorkspaceShell />;
}

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
          <span className="text-xs text-muted">workspace shell</span>
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

      <section className="grid flex-1 grid-cols-2 grid-rows-2 gap-px bg-edge">
        {PANELS.map((panel) => (
          <div key={panel.key} className="flex min-h-0 flex-col bg-surface p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
              {panel.title}
            </div>
            {panel.key === 'claude' ? (
              // The user is already signed in to Claude Code (the onboarding gate
              // guarantees it), so drop them straight into a running `claude`
              // session — no need to type the command themselves.
              <div className="min-h-0 flex-1 overflow-hidden rounded border border-edge bg-surface p-1">
                <TerminalView startupCommand="claude" />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded border border-dashed border-edge text-sm text-muted">
                {panel.hint}
              </div>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
