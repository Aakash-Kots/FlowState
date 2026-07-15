'use client';

import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { DiffStat } from '@/lib/types/diff';
import { cn } from '../../ui/cn';
import { DiffCounts } from '../DiffCounts';

///////////
// Types //
///////////

type ToolRowShellProps = {
  /** Leading lucide icon (already sized). Swaps to a `+` on hover when there's a
   * preview to expand. */
  icon: ReactNode;
  /** Short bold label, e.g. `Edit` / `Read 79 lines`. Omit for description-led
   * rows (Bash/Task) where the `summary` carries the text. */
  name?: string;
  /** Flexible primary text — a natural summary of what happened (a Bash/Task
   * `description`). Takes the row's leftover space and truncates. */
  summary?: ReactNode;
  /** Trailing detail chip — the filename / pattern / command. */
  target?: ReactNode;
  /** Full value for the target's `title` tooltip (e.g. the absolute path). */
  targetTitle?: string;
  /** Added/removed line counts shown after the target (e.g. an Edit's `+3 −1`). */
  counts?: DiffStat;
  /** Extra muted inline detail after the target (e.g. `3 edits`, a subagent type). */
  meta?: ReactNode;
  /** Rich detail (a diff, file, or output) revealed inline when the row is
   * clicked. When absent, the row isn't expandable. */
  preview?: ReactNode;
  /** Render the target as a self-styled chip (e.g. a `FileRef`) instead of plain
   * monospace text. */
  targetAsChip?: boolean;
  /** Tailwind text-color for the icon (e.g. a file-type tint). Defaults muted. */
  iconColor?: string;
  /** Tailwind text-color for the name label (e.g. a per-tool color). */
  nameColor?: string;
  /** Color the row for a failed tool result. */
  isError?: boolean;
};

/////////////
// Helpers //
/////////////

/** The leading glyph: the tool icon normally, a `+` on row-hover, and a rotated
 * `+` (an `×`) while expanded — the affordance that the row opens. */
function RowIcon({
  icon,
  color,
  expandable,
  expanded,
}: {
  icon: ReactNode;
  color: string;
  expandable: boolean;
  expanded: boolean;
}) {
  return (
    <span className={cn('relative flex size-3.5 shrink-0 items-center justify-center', color)}>
      {expanded ? (
        <Plus className="size-3.5 rotate-45" />
      ) : (
        <>
          <span className={cn('transition-opacity', expandable && 'group-hover:opacity-0')}>
            {icon}
          </span>
          {expandable && (
            <Plus className="absolute size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </>
      )}
    </span>
  );
}

////////////
// Export //
////////////

/**
 * The shared compact tool-call row: `[icon] [name] [summary] [target] [meta]`.
 * When it carries a `preview`, the whole row is a toggle — hovering swaps the
 * leading icon to a `+`, and clicking expands the preview (a diff, file, or
 * output) inline beneath the row. Every per-tool row composes this so they stay
 * visually uniform and only differ in label/preview.
 */
export function ToolRowShell({
  icon,
  name,
  summary,
  target,
  targetTitle,
  counts,
  meta,
  preview,
  targetAsChip,
  iconColor,
  nameColor,
  isError,
}: ToolRowShellProps) {
  const [expanded, setExpanded] = useState(false);
  const expandable = preview != null;

  const iconColorClass = isError ? 'text-danger' : (iconColor ?? 'text-muted-foreground');

  const inner = (
    <>
      <RowIcon
        icon={icon}
        color={iconColorClass}
        expandable={expandable}
        expanded={expanded}
      />

      {name && (
        <span
          className={cn(
            'shrink-0 font-medium',
            isError ? 'text-danger' : (nameColor ?? 'text-neutral-200'),
          )}
        >
          {name}
        </span>
      )}

      {summary != null && (
        <span className="min-w-0 flex-1 truncate text-neutral-200">{summary}</span>
      )}

      {target != null && (
        <span
          className={cn(
            'min-w-0 truncate',
            !targetAsChip && 'font-mono text-neutral-300',
            summary != null && 'max-w-[55%]',
          )}
          title={targetTitle}
        >
          {target}
        </span>
      )}

      {counts != null && <DiffCounts added={counts.added} removed={counts.removed} />}
      {meta != null && <span className="shrink-0 truncate text-muted-foreground/70">{meta}</span>}
    </>
  );

  // Content is padded but pulled back out with `-mx-2` so the hover background
  // reads as a full-bleed row highlight while the text still lines up with the
  // rest of the transcript.
  const rowClass = 'group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs';

  return (
    <div className="-mx-2">
      {expandable ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className={cn(rowClass, 'cursor-pointer transition-colors hover:bg-muted')}
        >
          {inner}
        </button>
      ) : (
        <div className={rowClass}>{inner}</div>
      )}

      {expandable && expanded && (
        <div className="ml-2 mt-1.5 w-fit max-w-full overflow-hidden rounded-md border border-border">
          {preview}
        </div>
      )}
    </div>
  );
}
