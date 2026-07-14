'use client';

import type { ReactNode } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../../ui/hover-card';
import { cn } from '../../ui/cn';

///////////
// Types //
///////////

type ToolRowShellProps = {
  /** Leading lucide icon (already sized). */
  icon: ReactNode;
  /** Tool label, e.g. `Edit`. */
  name: string;
  /** Hover target — the filename / pattern / command that opens the preview. */
  target?: ReactNode;
  /** Full value for the target's `title` tooltip (e.g. the absolute path). */
  targetTitle?: string;
  /** Extra muted inline detail after the target (e.g. `3 edits`, a grep path). */
  meta?: ReactNode;
  /** Rich hover-card content; when absent the target renders as plain text. */
  preview?: ReactNode;
  /** Render the target as a self-styled chip (e.g. a `FileRef`) instead of the
   * default underlined link text. */
  targetAsChip?: boolean;
  /** Tailwind text-color for the icon (e.g. a file-type tint). Defaults muted. */
  iconColor?: string;
  /** Tailwind text-color for the name label (e.g. a per-tool color). */
  nameColor?: string;
  /** Color the row for a failed tool result. */
  isError?: boolean;
};

////////////
// Export //
////////////

/**
 * The shared compact tool-call row: `[icon] [name] [target] [meta]`, where the
 * target is a hover-card trigger revealing the tool's rich `preview` (a diff,
 * file, or output). Every per-tool row composes this so they stay visually
 * uniform and only differ in icon/label/preview.
 */
export function ToolRowShell({
  icon,
  name,
  target,
  targetTitle,
  meta,
  preview,
  targetAsChip,
  iconColor,
  nameColor,
  isError,
}: ToolRowShellProps) {
  return (
    <div className="flex w-full items-center gap-2 font-mono text-xs">
      <span
        className={cn('shrink-0', isError ? 'text-danger' : (iconColor ?? 'text-muted-foreground'))}
      >
        {icon}
      </span>
      <span
        className={cn(
          'shrink-0 font-medium',
          isError ? 'text-danger' : (nameColor ?? 'text-neutral-300'),
        )}
      >
        {name}
      </span>
      {target != null &&
        (preview ? (
          <HoverCard openDelay={150} closeDelay={100}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                title={targetTitle}
                className={cn(
                  'flex min-w-0 text-left transition-colors',
                  targetAsChip
                    ? 'rounded-md hover:brightness-110'
                    : 'truncate text-neutral-200 underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 hover:text-white',
                )}
              >
                {target}
              </button>
            </HoverCardTrigger>
            <HoverCardContent side="top" align="start" className="p-0">
              {preview}
            </HoverCardContent>
          </HoverCard>
        ) : (
          <span className="min-w-0 truncate text-neutral-300" title={targetTitle}>
            {target}
          </span>
        ))}
      {meta != null && <span className="shrink-0 truncate text-muted-foreground/70">{meta}</span>}
    </div>
  );
}
