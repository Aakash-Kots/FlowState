'use client';

import { useEffect, useState } from 'react';
import type { AppInfo } from '@flowstate/shared';
import { trpc } from '@/lib/trpc';

const PANELS = [
  { key: 'git', title: 'Git', hint: 'Status, diff, commit, push' },
  { key: 'terminal', title: 'Terminal', hint: 'Integrated pty tabs' },
  { key: 'claude', title: 'Claude Code', hint: 'Agent session for this worktree' },
  { key: 'linear', title: 'Linear', hint: 'Assigned issues & status' },
] as const;

export default function Page() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // End-to-end IPC smoke test: call the main process on mount and show the
  // result. If this renders, renderer → preload → main tRPC is wired up.
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
          <h1 className="text-sm font-semibold tracking-wide text-white">FlowState</h1>
          <span className="text-xs text-neutral-500">workspace shell</span>
        </div>
        <div className="text-xs text-neutral-400">
          {info ? (
            <span>
              {info.name} v{info.version} · {info.platform} ·{' '}
              <span className="text-emerald-400">IPC connected</span>
            </span>
          ) : error ? (
            <span className="text-amber-400">IPC: {error}</span>
          ) : (
            <span className="text-neutral-500">connecting to main…</span>
          )}
        </div>
      </header>

      <section className="grid flex-1 grid-cols-2 grid-rows-2 gap-px bg-edge">
        {PANELS.map((panel) => (
          <div key={panel.key} className="flex flex-col bg-panel p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">
              {panel.title}
            </div>
            <div className="flex flex-1 items-center justify-center rounded border border-dashed border-edge text-sm text-neutral-500">
              {panel.hint}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
