'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

///////////
// Types //
///////////

// Presentational variant prop — intentionally a string-literal union, not an enum (conventions §4).
type Variant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

///////////////
// Constants //
///////////////

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted',
  secondary:
    'bg-muted text-neutral-200 border border-border hover:bg-accent disabled:text-muted-foreground disabled:hover:bg-muted',
  ghost: 'bg-transparent text-muted-foreground hover:text-neutral-100 hover:bg-muted',
};

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium',
        'transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
