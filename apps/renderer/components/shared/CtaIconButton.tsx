'use client';

import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react';
import { cn } from '../ui/cn';

///////////
// Types //
///////////

type CtaIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Leading icon, e.g. a lucide icon component. */
  icon: ComponentType<{ className?: string }>;
  /** The button label. */
  children: ReactNode;
};

/**
 * A full-width call-to-action button with a leading icon and a label. Reusable
 * across the app; styled to sit inside the sidebar (dashed, muted, hover-raise)
 * and to collapse to icon-only when the sidebar is in icon mode.
 */
export function CtaIconButton({ icon: Icon, children, className, ...props }: CtaIconButtonProps) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-sm font-medium text-muted-foreground',
        'transition-colors hover:border-border/80 hover:bg-muted hover:text-foreground',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
        'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0',
        className,
      )}
      {...props}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate group-data-[collapsible=icon]:hidden">{children}</span>
    </button>
  );
}
