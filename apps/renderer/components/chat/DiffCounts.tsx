'use client';

import type { DiffStat } from '@/lib/types/diff';

////////////
// Export //
////////////

/**
 * Green `+N` / red `−N` added/removed line counts (a real minus `−`, not a
 * hyphen), in tabular monospace. The single visual for a file's diff stat across
 * the chat — the tool rows and the turn summary both compose it. A dot renders
 * when nothing changed so the slot never collapses to empty.
 */
export function DiffCounts({ added, removed }: DiffStat) {
  return (
    <span className="flex shrink-0 items-center gap-1 font-mono tabular-nums">
      {added > 0 && <span className="text-success">+{added}</span>}
      {removed > 0 && <span className="text-danger">−{removed}</span>}
      {added === 0 && removed === 0 && <span className="text-muted-foreground">·</span>}
    </span>
  );
}
