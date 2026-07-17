'use client';

import type { ReactNode } from 'react';
import { cn } from '../ui/cn';

///////////////////
// Sub-components //
///////////////////

/**
 * One settings row: a title + description on the left and its control on the
 * right. `stack` drops the control onto its own full-width line below the label
 * for wide controls (e.g. a theme grid).
 */
export function SettingRow({
  title,
  description,
  control,
  stack = false,
}: {
  title: string;
  description: string;
  control: ReactNode;
  stack?: boolean;
}) {
  return (
    <div
      className={cn('px-4 py-3.5', stack ? 'space-y-3' : 'flex items-center justify-between gap-6')}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className={cn(stack ? '' : 'shrink-0')}>{control}</div>
    </div>
  );
}

/** A titled group of rows in a bordered card. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {children}
      </div>
    </section>
  );
}
