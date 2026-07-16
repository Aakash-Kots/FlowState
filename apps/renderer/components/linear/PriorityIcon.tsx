'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '../ui/cn';

///////////
// Types //
///////////

type PriorityMeta = {
  label: string;
  /** How many of the three signal bars are filled. */
  bars: number;
  /** Urgent renders a distinct alert glyph instead of bars. */
  urgent?: boolean;
};

///////////////
// Constants //
///////////////

/** Linear's priority scale: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
export const PRIORITY_META: Record<number, PriorityMeta> = {
  0: { label: 'No priority', bars: 0 },
  1: { label: 'Urgent', bars: 3, urgent: true },
  2: { label: 'High', bars: 3 },
  3: { label: 'Medium', bars: 2 },
  4: { label: 'Low', bars: 1 },
};

/** Priorities in menu order (urgent → low, then none) — the filter/create picker. */
export const PRIORITY_OPTIONS: number[] = [1, 2, 3, 4, 0];

/** Label for a priority value (falls back to "No priority"). */
export function priorityLabel(priority: number): string {
  return (PRIORITY_META[priority] ?? PRIORITY_META[0]).label;
}

////////////
// Export //
////////////

/** Linear-style priority glyph: an amber alert for Urgent, else three signal bars. */
export function PriorityIcon({ priority, className }: { priority: number; className?: string }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META[0];

  if (meta.urgent) {
    return <AlertTriangle className={cn('size-3.5 text-warn', className)} aria-label={meta.label} />;
  }

  const heights = ['h-1.5', 'h-2.5', 'h-3.5'];
  return (
    <span
      className={cn('inline-flex items-end gap-0.5', className)}
      aria-label={meta.label}
      title={meta.label}
    >
      {heights.map((h, i) => (
        <span
          key={h}
          className={cn(
            'w-0.5 rounded-sm',
            h,
            i < meta.bars ? 'bg-neutral-300' : 'bg-muted-foreground/40',
          )}
        />
      ))}
    </span>
  );
}
