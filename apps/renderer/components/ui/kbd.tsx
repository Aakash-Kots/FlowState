import * as React from 'react';
import { cn } from './cn';

/**
 * Renders a key combination as a row of small key-cap chips. Purely
 * presentational — pass already-formatted display tokens (e.g. `['⌘', 'K']`);
 * chord parsing lives in the feature layer.
 */
export function Kbd({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-edge bg-raised px-1.5 text-[11px] font-medium text-muted-foreground"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
