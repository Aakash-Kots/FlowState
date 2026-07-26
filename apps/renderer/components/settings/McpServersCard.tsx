'use client';

import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { McpTransport, type McpServerConfig, type McpServerSummary } from '@flowstate/shared';
import { trpc } from '@/lib/trpc';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';

///////////
// Types //
///////////

/** The editor form's raw string state (parsed into an McpServerConfig on save). */
type Draft = {
  /** The name being edited (null when adding a new server). */
  originalName: string | null;
  name: string;
  transport: McpTransport;
  enabled: boolean;
  command: string;
  /** One argument per line. */
  args: string;
  /** `KEY=value` per line. */
  env: string;
  url: string;
  /** `Header-Name: value` per line. */
  headers: string;
};

///////////////
// Constants //
///////////////

const TRANSPORT_OPTIONS: { value: McpTransport; label: string }[] = [
  { value: McpTransport.Stdio, label: 'Local (stdio)' },
  { value: McpTransport.Http, label: 'HTTP' },
  { value: McpTransport.Sse, label: 'SSE' },
];

const EMPTY_DRAFT: Draft = {
  originalName: null,
  name: '',
  transport: McpTransport.Stdio,
  enabled: true,
  command: '',
  args: '',
  env: '',
  url: '',
  headers: '',
};

/////////////
// Helpers //
/////////////

/** Split a textarea into trimmed, non-empty lines. */
function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Parse `key<sep>value` lines into an object, or undefined when empty. */
function parseMap(text: string, sep: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of lines(text)) {
    const idx = line.indexOf(sep);
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + sep.length).trim();
    if (key) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Build a draft to edit an existing server (secret env/headers stay blank). */
function draftFromSummary(s: McpServerSummary): Draft {
  return {
    originalName: s.name,
    name: s.name,
    transport: s.transport,
    enabled: s.enabled,
    command: s.command ?? '',
    args: (s.args ?? []).join('\n'),
    env: '',
    url: s.url ?? '',
    headers: '',
  };
}

/** Turn a draft into the config to persist (undefined for blank optional fields). */
function draftToConfig(d: Draft): McpServerConfig {
  const base = { name: d.name.trim(), transport: d.transport, enabled: d.enabled };
  if (d.transport === McpTransport.Stdio) {
    const args = lines(d.args);
    return {
      ...base,
      command: d.command.trim(),
      ...(args.length > 0 ? { args } : {}),
      ...(parseMap(d.env, '=') ? { env: parseMap(d.env, '=') } : {}),
    };
  }
  return {
    ...base,
    url: d.url.trim(),
    ...(parseMap(d.headers, ':') ? { headers: parseMap(d.headers, ':') } : {}),
  };
}

/** One-line display of where a server points. */
function displayTarget(s: McpServerSummary): string {
  return s.transport === McpTransport.Stdio
    ? [s.command ?? '', ...(s.args ?? [])].join(' ').trim()
    : (s.url ?? '');
}

///////////////////
// Sub-components //
///////////////////

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

/** Labelled text input used throughout the editor form. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-neutral-300">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          'w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none',
          mono && 'font-mono text-[13px]',
        )}
      />
    </label>
  );
}

/** Labelled multi-line input for args / env / headers. */
function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-neutral-300">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        rows={3}
        className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[13px] text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
      />
      {hint && <span className="text-[11px] leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** The add/edit form for a single server. */
function ServerForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Draft;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isStdio = draft.transport === McpTransport.Stdio;
  const editing = initial.originalName !== null;

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    if (!draft.name.trim()) return setError('A name is required.');
    if (isStdio && !draft.command.trim()) return setError('A stdio server needs a command.');
    if (!isStdio && !draft.url.trim()) return setError('An HTTP/SSE server needs a URL.');
    setBusy(true);
    setError(null);
    try {
      // A rename removes the old entry so it isn't orphaned under its old name.
      if (editing && initial.originalName && initial.originalName !== draft.name.trim()) {
        await trpc().mcp.remove.mutate({ name: initial.originalName });
      }
      await trpc().mcp.upsert.mutate(draftToConfig(draft));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-background/40 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Name"
          value={draft.name}
          onChange={(name) => set({ name })}
          placeholder="my-server"
        />
        <label className="block space-y-1">
          <span className="text-xs font-medium text-neutral-300">Transport</span>
          <select
            value={draft.transport}
            onChange={(e) => set({ transport: e.target.value as McpTransport })}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-neutral-100 focus:border-primary/50 focus:outline-none"
          >
            {TRANSPORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isStdio ? (
        <>
          <Field
            label="Command"
            value={draft.command}
            onChange={(command) => set({ command })}
            placeholder="npx"
            mono
          />
          <TextArea
            label="Arguments"
            value={draft.args}
            onChange={(args) => set({ args })}
            placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir'}
            hint="One argument per line."
          />
          <TextArea
            label="Environment variables"
            value={draft.env}
            onChange={(env) => set({ env })}
            placeholder={'API_KEY=sk-…'}
            hint={
              editing
                ? 'KEY=value per line. Leave blank to keep the existing values; these are encrypted and never shown.'
                : 'KEY=value per line. Encrypted with your OS keychain.'
            }
          />
        </>
      ) : (
        <>
          <Field
            label="URL"
            value={draft.url}
            onChange={(url) => set({ url })}
            placeholder="https://example.com/mcp"
            mono
          />
          <TextArea
            label="Headers"
            value={draft.headers}
            onChange={(headers) => set({ headers })}
            placeholder={'Authorization: Bearer …'}
            hint={
              editing
                ? 'Header: value per line. Leave blank to keep the existing values; these are encrypted and never shown.'
                : 'Header: value per line. Encrypted with your OS keychain.'
            }
          />
        </>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : editing ? 'Save' : 'Add server'}
        </Button>
      </div>
    </div>
  );
}

/** A read-only row in the server list. */
function ServerRow({
  server,
  onEdit,
  onToggle,
  onRemove,
}: {
  server: McpServerSummary;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-neutral-100">{server.name}</span>
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {server.transport}
          </span>
          {server.hasSecrets && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              secured
            </span>
          )}
        </div>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {displayTarget(server)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Toggle
          checked={server.enabled}
          onChange={onToggle}
          label={server.enabled ? 'Disable server' : 'Enable server'}
        />
        <button
          type="button"
          onClick={onEdit}
          title="Edit"
          aria-label="Edit"
          className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-neutral-100"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Remove"
          aria-label="Remove"
          className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-danger"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

///////////////
// Main card //
///////////////

/**
 * The MCP-servers control in Settings: a list of the user's registered MCP
 * servers (applied to every workspace's Claude session) with add / edit / remove
 * and an enable toggle. Secret-bearing fields (env vars, request headers) are
 * encrypted in the main process and never sent back — editing re-enters them (or
 * leaves them blank to keep the stored values), mirroring the Gemini key card.
 */
export function McpServersCard() {
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);

  const refresh = () => {
    void trpc()
      .mcp.list.query()
      .then(setServers)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const remove = async (name: string) => {
    setServers((prev) => prev.filter((s) => s.name !== name));
    await trpc().mcp.remove.mutate({ name });
  };

  const toggle = async (name: string, enabled: boolean) => {
    setServers((prev) => prev.map((s) => (s.name === name ? { ...s, enabled } : s)));
    await trpc().mcp.setEnabled.mutate({ name, enabled });
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading servers…
      </p>
    );
  }

  // The form replaces the list while adding/editing (a focused, single-task view).
  if (draft) {
    return (
      <ServerForm
        initial={draft}
        onCancel={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-2">
      {servers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No MCP servers yet. Add one to give Claude extra tools across every workspace.
        </p>
      ) : (
        servers.map((server) => (
          <ServerRow
            key={server.name}
            server={server}
            onEdit={() => setDraft(draftFromSummary(server))}
            onToggle={(enabled) => void toggle(server.name, enabled)}
            onRemove={() => void remove(server.name)}
          />
        ))
      )}
      <Button variant="secondary" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
        <Plus className="size-4" />
        Add server
      </Button>
    </div>
  );
}
