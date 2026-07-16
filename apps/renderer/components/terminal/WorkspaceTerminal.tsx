'use client';

import { useEffect, useRef } from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { XTERM_THEME } from '@/lib/constants/terminal';
import { trpc } from '@/lib/trpc';

/////////////
// Helpers //
/////////////

/** `h s% l%` (a shadcn HSL token) → `#rrggbb`. */
function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Resolve a shadcn HSL CSS variable (e.g. `--secondary`) to a hex xterm accepts. */
function resolveThemeColor(cssVar: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  const m = raw.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  return m ? hslToHex(Number(m[1]), Number(m[2]), Number(m[3])) : fallback;
}

/**
 * A persistent workspace terminal, backed by a main-process node-pty keyed by
 * the terminal tab id. Unlike the ephemeral onboarding `TerminalView`, the pty
 * is kept alive across mounts: `spawn` is idempotent (a no-op reattach if the
 * pty is already running), the `onData` subscription replays retained scrollback
 * before streaming live output, and unmount only detaches — it never kills. The
 * pty is torn down explicitly when the tab is closed or the worktree removed.
 *
 * This only attaches — it never types the Setup/Run script. That is owned by the
 * main-process orchestrator (`startWorkspaceScripts`), so the Run script waits
 * for Setup even if the user opens the Run tab first.
 *
 * xterm is imported lazily inside the effect so it never runs during Next's
 * static prerender (it touches the DOM at module load).
 */
export function WorkspaceTerminal({
  terminalId,
  cwd,
}: {
  terminalId: string;
  /** Working folder for the shell — the worktree path. */
  cwd?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Captured once: the pty is spawned a single time, so a later re-render can't
  // change what the already-running shell was launched with.
  const cwdRef = useRef(cwd);

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

      // Match the surrounding panel (`bg-secondary`) instead of the darker base,
      // so the terminal reads as part of the panel rather than its own surface.
      const panelBg = resolveThemeColor('--secondary', XTERM_THEME.background);
      const t = new Terminal({
        theme: { ...XTERM_THEME, background: panelBg, cursorAccent: panelBg },
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

  // Outer padded panel-colored frame (matches the surrounding panel); the inner
  // element is the xterm host, so the inset never skews the fit addon's sizing.
  return (
    <div className="h-full w-full bg-secondary p-2">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
