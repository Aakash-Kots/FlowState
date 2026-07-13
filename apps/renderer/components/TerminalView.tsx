'use client';

import { useEffect, useRef } from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { trpc } from '@/lib/trpc';

// xterm theme tuned to the app's dark gray-accent tokens (tailwind.config.ts).
const THEME = {
  background: '#1e1f21', // surface
  foreground: '#e5e7eb',
  cursor: '#d6d7d9', // accent
  cursorAccent: '#1e1f21',
  selectionBackground: '#37383b',
  black: '#161718',
  brightBlack: '#8f9194',
  white: '#d6d7d9',
  brightWhite: '#ffffff',
  green: '#4ade80',
  brightGreen: '#4ade80',
  yellow: '#fbbf24',
  brightYellow: '#fbbf24',
  red: '#f87171',
  brightRed: '#f87171',
  blue: '#7aa2f7',
  cyan: '#67e8f9',
  magenta: '#c4b5fd',
};

/**
 * Embedded terminal backed by a main-process node-pty. xterm is imported lazily
 * inside the effect so it never runs during Next's static prerender (it touches
 * the DOM at module load). Reports the spawned pty id to the parent so the
 * Connect buttons can inject `claude auth login` / `gh auth login` into it.
 */
export function TerminalView({
  onSpawned,
  startupCommand,
}: {
  onSpawned?: (id: string) => void;
  /** Auto-typed into the shell once it's ready (e.g. `claude` for the agent tab). */
  startupCommand?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the latest callback without making it an effect dependency — the pty
  // must be spawned exactly once, not on every parent re-render.
  const onSpawnedRef = useRef(onSpawned);
  onSpawnedRef.current = onSpawned;
  // The pty is spawned once; capture the startup command so a later re-render
  // can't change what the already-running shell was launched with.
  const startupCommandRef = useRef(startupCommand);

  useEffect(() => {
    let disposed = false;
    let term: XTerm | null = null;
    let terminalId: string | null = null;
    let unsubscribe: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;

    void (async () => {
      const el = containerRef.current;
      if (!el) return;

      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (disposed) return;

      const t = new Terminal({
        theme: THEME,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 13,
        cursorBlink: true,
        allowProposedApi: true,
      });
      const fit = new FitAddon();
      t.loadAddon(fit);
      t.open(el);
      fit.fit();
      term = t;

      const { id } = await trpc().terminal.spawn.mutate({
        cols: t.cols,
        rows: t.rows,
        startupCommand: startupCommandRef.current,
      });
      if (disposed) {
        void trpc().terminal.kill.mutate({ id });
        return;
      }
      terminalId = id;
      onSpawnedRef.current?.(id);

      const sub = trpc().terminal.onData.subscribe(
        { id },
        { onData: (chunk: string) => t.write(chunk), onError: () => {} },
      );
      unsubscribe = () => sub.unsubscribe();

      t.onData((data) => void trpc().terminal.input.mutate({ id, data }));

      resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
          void trpc().terminal.resize.mutate({ id, cols: t.cols, rows: t.rows });
        } catch {
          /* container detached mid-resize */
        }
      });
      resizeObserver.observe(el);
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      unsubscribe?.();
      if (terminalId) void trpc().terminal.kill.mutate({ id: terminalId });
      term?.dispose();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
