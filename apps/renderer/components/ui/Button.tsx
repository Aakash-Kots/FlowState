'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-base hover:bg-white disabled:bg-raised disabled:text-muted disabled:hover:bg-raised',
  secondary:
    'bg-raised text-neutral-200 border border-edge hover:bg-edge disabled:text-muted disabled:hover:bg-raised',
  ghost: 'bg-transparent text-muted hover:text-neutral-100 hover:bg-raised',
};

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium',
        'transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/60',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
