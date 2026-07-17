'use client';

import { useEffect, useRef } from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { XTERM_THEME } from '@/lib/constants/terminal';
import { trpc } from '@/lib/trpc';

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

      const [{ Terminal }, { FitAddon }, { WebglAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-webgl'),
      ]);
      if (disposed) return;

      const t = new Terminal({
        theme: XTERM_THEME,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 13,
        // Blinking drives a perpetual repaint that keeps the compositor awake
        // even on an idle terminal; a static block cursor costs nothing.
        cursorBlink: false,
        allowProposedApi: true,
      });
      const fit = new FitAddon();
      t.loadAddon(fit);
      t.open(el);
      fit.fit();

      // Prefer the GPU renderer: xterm's default DOM renderer is its most
      // CPU/energy-expensive backend under heavy output. Fall back to the DOM
      // renderer if a WebGL context isn't available or is later lost (GPU reset,
      // headless); `dispose()` on the addon reverts xterm to DOM automatically.
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        t.loadAddon(webgl);
      } catch {
        /* no WebGL context — DOM renderer stays active */
      }
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
