'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { ChatMessageMeta, TurnFileChange } from '@flowstate/shared';
import { fileTypeForPath } from '@/lib/constants/fileTypes';
import { formatDuration } from '@/lib/format';
import { cn } from '../ui/cn';

///////////////
// Constants //
///////////////

/** How many file pills to show before collapsing the rest into "+N more". */
const VISIBLE_PILLS = 4;

/////////////
// Helpers //
/////////////

/** Trailing path segment (filename) for a compact pill label. */
function basename(path: string): string {
  const base = path.split('/').pop();
  return base && base.length > 0 ? base : path;
}

/** A one-line "N files · +X -Y" headline for the copied summary and tooltips. */
function totals(changes: TurnFileChange[]): { insertions: number; deletions: number } {
  return changes.reduce(
    (acc, c) => ({ insertions: acc.insertions + c.insertions, deletions: acc.deletions + c.deletions }),
    { insertions: 0, deletions: 0 },
  );
}

/** Plain-text summary copied to the clipboard: a headline plus one line per file. */
function summaryText(changes: TurnFileChange[]): string {
  const { insertions, deletions } = totals(changes);
  const header = `${changes.length} file${changes.length === 1 ? '' : 's'} changed  +${insertions} -${deletions}`;
  const lines = changes.map((c) => `${c.path}  +${c.insertions} -${c.deletions}`);
  return [header, ...lines].join('\n');
}

///////////////////
// Sub-components //
///////////////////

/** Green `+N` / red `−N` counts, matching the git ChangeList styling. */
function Counts({ insertions, deletions }: { insertions: number; deletions: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 tabular-nums">
      {insertions > 0 && <span className="text-success">+{insertions}</span>}
      {deletions > 0 && <span className="text-danger">−{deletions}</span>}
      {insertions === 0 && deletions === 0 && <span className="text-muted-foreground">·</span>}
    </span>
  );
}

/** One file pill: type icon, filename, and its per-turn line counts. */
function FilePill({ change }: { change: TurnFileChange }) {
  const { Icon, color } = fileTypeForPath(change.path);
  return (
    <span
      className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1"
      title={change.path}
    >
      <Icon className={cn('size-3.5 shrink-0', color)} />
      <span className="max-w-[12rem] truncate text-neutral-200">{basename(change.path)}</span>
      <Counts insertions={change.insertions} deletions={change.deletions} />
    </span>
  );
}

////////////
// Export //
////////////

/**
 * The end-of-turn changed-files summary: the turn's duration, a copy action, and
 * a pill per file it touched (with a "+N more" overflow that aggregates the
 * remainder's counts). Rendered inside the `Result` message bubble, so it only
 * appears once a turn has finished.
 */
export function TurnSummary({ meta }: { meta: ChatMessageMeta }) {
  const [copied, setCopied] = useState(false);
  const changes = meta.fileChanges ?? [];
  if (changes.length === 0) return null;

  const visible = changes.slice(0, VISIBLE_PILLS);
  const overflow = changes.slice(VISIBLE_PILLS);
  const overflowTotals = totals(overflow);

  const copy = () => {
    void navigator.clipboard.writeText(summaryText(changes)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-xs">
      {meta.durationMs != null && (
        <span className="tabular-nums text-muted-foreground">{formatDuration(meta.durationMs)}</span>
      )}
      <button
        type="button"
        onClick={copy}
        title="Copy changed files"
        className="inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-neutral-200"
      >
        {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
      </button>

      {visible.map((c) => (
        <FilePill key={c.path} change={c} />
      ))}

      {overflow.length > 0 && (
        <span
          className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground"
          title={overflow.map((c) => c.path).join('\n')}
        >
          <span>+{overflow.length} more</span>
          <Counts insertions={overflowTotals.insertions} deletions={overflowTotals.deletions} />
        </span>
      )}
    </div>
  );
}
