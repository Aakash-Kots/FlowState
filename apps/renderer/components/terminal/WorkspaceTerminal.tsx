'use client';

import { useEffect, useRef } from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { XTERM_THEME } from '@/lib/constants/terminal';
import { trpc } from '@/lib/trpc';

/**
 * A persistent workspace terminal, backed by a main-process node-pty keyed by
 * the terminal tab id. Unlike the ephemeral onboarding `TerminalView`, the pty
 * is kept alive across mounts: `spawn` is idempotent (a no-op reattach if the
 * pty is already running), the `onData` subscription replays retained scrollback
 * before streaming live output, and unmount only detaches — it never kills. The
 * pty is torn down explicitly when the tab is closed or the worktree removed.
 *
 * xterm is imported lazily inside the effect so it never runs during Next's
 * static prerender (it touches the DOM at module load).
 */
export function WorkspaceTerminal({
  terminalId,
  cwd,
  startupCommand,
}: {
  terminalId: string;
  /** Working folder for the shell — the worktree path. */
  cwd?: string | null;
  /** Auto-run once when the pty is first spawned (the Setup/Run script). */
  startupCommand?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Captured once: the pty is spawned a single time, so a later re-render can't
  // change what the already-running shell was launched with.
  const cwdRef = useRef(cwd);
  const startupCommandRef = useRef(startupCommand);

  useEffect(() => {
    let disposed = false;
    let term: XTerm | null = null;
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
        theme: XTERM_THEME,
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

      // Spawn-if-needed: main returns the same id (a no-op) when the pty is
      // already live, so a reattach never double-spawns or reruns the command.
      await trpc().terminal.spawn.mutate({
        id: terminalId,
        cwd: cwdRef.current ?? undefined,
        cols: t.cols,
        rows: t.rows,
        startupCommand: startupCommandRef.current ?? undefined,
      });
      if (disposed) return;

      // The subscription replays retained scrollback first, then streams live —
      // so a reattached terminal repaints its history immediately.
      const sub = trpc().terminal.onData.subscribe(
        { id: terminalId },
        { onData: (chunk: string) => t.write(chunk), onError: () => {} },
      );
      unsubscribe = () => sub.unsubscribe();

      t.onData((data) => void trpc().terminal.input.mutate({ id: terminalId, data }));

      resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
          void trpc().terminal.resize.mutate({ id: terminalId, cols: t.cols, rows: t.rows });
        } catch {
          /* container detached mid-resize */
        }
      });
      resizeObserver.observe(el);
    })();

    return () => {
      // Detach only — the pty keeps running under another view/worktree so a
      // dev server survives. Teardown happens on close/worktree-removal.
      disposed = true;
      resizeObserver?.disconnect();
      unsubscribe?.();
      term?.dispose();
    };
  }, [terminalId]);

  // Outer padded base-colored frame (like the code window); the inner element is
  // the xterm host, so the inset never skews the fit addon's row/col sizing.
  return (
    <div className="h-full w-full bg-background p-2">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
