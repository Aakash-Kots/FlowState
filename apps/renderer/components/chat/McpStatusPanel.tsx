'use client';

import { useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { LogIn, Loader2, RefreshCw, Settings2, X } from 'lucide-react';
import {
  McpConnectionStatus,
  McpTransport,
  type McpServerSummary,
} from '@flowstate/shared';
import { closeMcpPanel, loadMcpStatus, useChat, useTabId } from '@/lib/chat';
import { setSettingsOpen } from '@/lib/settings';
import { trpc } from '@/lib/trpc';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';

///////////
// Types //
///////////

/** A merged view of one server: its config (if FlowState-managed) + live status. */
type McpRow = {
  name: string;
  /** True when FlowState manages this server (vs. a project `.mcp.json` server). */
  managed: boolean;
  enabled: boolean;
  transport?: McpTransport;
  target?: string;
  status: McpConnectionStatus;
  tools: string[];
  error?: string;
};

///////////////
// Constants //
///////////////

/** Pill styling per connection status. */
const STATUS_META: Record<McpConnectionStatus, { dot: string; text: string; label: string }> = {
  [McpConnectionStatus.Connected]: { dot: 'bg-success', text: 'text-success', label: 'Connected' },
  [McpConnectionStatus.Failed]: { dot: 'bg-danger', text: 'text-danger', label: 'Failed' },
  [McpConnectionStatus.NeedsAuth]: { dot: 'bg-warn', text: 'text-warn', label: 'Needs auth' },
  [McpConnectionStatus.Pending]: {
    dot: 'bg-warn animate-pulse',
    text: 'text-warn',
    label: 'Connecting…',
  },
  [McpConnectionStatus.Disabled]: {
    dot: 'bg-muted-foreground',
    text: 'text-muted-foreground',
    label: 'Disabled',
  },
};

const TRANSPORT_LABEL: Record<McpTransport, string> = {
  [McpTransport.Stdio]: 'stdio',
  [McpTransport.Http]: 'HTTP',
  [McpTransport.Sse]: 'SSE',
};

/////////////
// Helpers //
/////////////

/** One-line display of where a server points (command line, or url). */
function displayTarget(s: McpServerSummary): string {
  return s.transport === McpTransport.Stdio
    ? [s.command ?? '', ...(s.args ?? [])].join(' ').trim()
    : (s.url ?? '');
}

///////////////////
// Sub-components //
///////////////////

/** A small connection-status pill. */
function StatusPill({ status }: { status: McpConnectionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium',
        meta.text,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}

/** A pill toggle switch (mirrors the Settings page's Toggle). */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'inline-block size-4 rounded-full bg-background shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/** One server row: identity + status on the left, actions on the right. */
function ServerRow({
  row,
  busy,
  onReconnect,
  onAuthenticate,
  onToggle,
}: {
  row: McpRow;
  busy: boolean;
  onReconnect: () => void;
  onAuthenticate: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const needsAuth = row.status === McpConnectionStatus.NeedsAuth;
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
          {row.transport && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {TRANSPORT_LABEL[row.transport]}
            </span>
          )}
          {!row.managed && (
            <span
              className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
              title="Defined by the project's .mcp.json, not FlowState"
            >
              project
            </span>
          )}
          <StatusPill status={row.status} />
        </div>
        {row.target && (
          <p className="truncate font-mono text-[11px] text-muted-foreground">{row.target}</p>
        )}
        {row.error && <p className="text-[11px] text-danger">{row.error}</p>}
        {row.tools.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {row.tools.length} tool{row.tools.length === 1 ? '' : 's'}: {row.tools.join(', ')}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {needsAuth && (
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            onClick={onAuthenticate}
            disabled={busy}
            title="Authenticate this server"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <LogIn className="size-3.5" />}
            Authenticate
          </Button>
        )}
        {row.enabled && !needsAuth && (
          <button
            type="button"
            onClick={onReconnect}
            disabled={busy}
            title="Reconnect"
            aria-label="Reconnect"
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              busy && 'cursor-not-allowed opacity-60',
            )}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </button>
        )}
        {row.managed && (
          <Toggle
            checked={row.enabled}
            onChange={onToggle}
            label={row.enabled ? 'Disable server' : 'Enable server'}
          />
        )}
      </div>
    </div>
  );
}

/////////////////
// Panel shell //
/////////////////

/**
 * The `/mcp` status panel — a native replacement for the CLI's interactive
 * `/mcp` command. Shows every MCP server the tab's session sees (FlowState-
 * managed + the project's `.mcp.json`) with live connection status, per-server
 * tools, and reconnect / enable-disable / authenticate actions. Opened by typing
 * `/mcp` in the composer (or picking it from the `/` menu).
 */
export function McpStatusPanel() {
  const tabId = useTabId();
  const open = useChat((s) => s.mcpPanelOpen);
  const liveStatus = useChat((s) => s.mcpStatus);
  const [summaries, setSummaries] = useState<McpServerSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Refresh the FlowState-managed config list each time the panel opens (the
  // live status is refreshed by openMcpPanel + the McpStatusUpdated event).
  useEffect(() => {
    if (!open) return;
    void trpc()
      .mcp.list.query()
      .then(setSummaries)
      .catch(() => {});
  }, [open]);

  const rows = useMemo<McpRow[]>(() => {
    const liveByName = new Map(liveStatus.map((s) => [s.name, s]));
    const seen = new Set<string>();
    const out: McpRow[] = [];
    for (const cfg of summaries) {
      seen.add(cfg.name);
      const live = liveByName.get(cfg.name);
      out.push({
        name: cfg.name,
        managed: true,
        enabled: cfg.enabled,
        transport: cfg.transport,
        target: displayTarget(cfg),
        status: !cfg.enabled
          ? McpConnectionStatus.Disabled
          : (live?.status ?? McpConnectionStatus.Pending),
        tools: live?.tools ?? [],
        error: live?.error,
      });
    }
    // Servers the session sees that FlowState doesn't manage (project .mcp.json).
    for (const live of liveStatus) {
      if (seen.has(live.name)) continue;
      out.push({
        name: live.name,
        managed: false,
        enabled: true,
        status: live.status,
        tools: live.tools,
        error: live.error,
      });
    }
    return out;
  }, [summaries, liveStatus]);

  const reconnect = async (name: string) => {
    setBusy(name);
    try {
      await trpc().claude.reconnectMcpServer.mutate({ tabId, name });
      loadMcpStatus(tabId);
    } finally {
      setBusy(null);
    }
  };

  // Runs the OAuth flow (opens the browser via the main process). The mutation
  // resolves once the CLI's auth flow finishes, so the button stays busy for the
  // duration; we then refresh status so the row flips needs-auth → connected.
  const authenticate = async (name: string) => {
    setBusy(name);
    try {
      await trpc().claude.authenticateMcpServer.mutate({ tabId, name });
      loadMcpStatus(tabId);
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (name: string, enabled: boolean) => {
    setSummaries((prev) => prev.map((s) => (s.name === name ? { ...s, enabled } : s)));
    await trpc().mcp.setEnabled.mutate({ name, enabled });
    loadMcpStatus(tabId);
  };

  const openSettings = () => {
    closeMcpPanel(tabId);
    setSettingsOpen(true);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && closeMcpPanel(tabId)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-background p-5 shadow-2xl shadow-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="mb-1 flex items-center justify-between">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              MCP servers
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Live connection status for this session&apos;s MCP servers. Add or edit servers in
            Settings.
          </p>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                No MCP servers configured yet.
              </div>
            ) : (
              rows.map((row) => (
                <ServerRow
                  key={row.name}
                  row={row}
                  busy={busy === row.name}
                  onReconnect={() => void reconnect(row.name)}
                  onAuthenticate={() => void authenticate(row.name)}
                  onToggle={(enabled) => void toggle(row.name, enabled)}
                />
              ))
            )}
          </div>

          <div className="mt-4 flex items-center justify-end">
            <Button variant="secondary" onClick={openSettings}>
              <Settings2 className="size-4" />
              Manage in Settings
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
