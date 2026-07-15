'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';
import { BUTTON_BASE, BUTTON_VARIANTS, type ButtonVariant } from './buttonVariants';

///////////
// Types //
///////////

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

/** Square, icon-only button sharing {@link Button}'s variants. Children = a
 * lucide icon; always pass a `title`/`aria-label` for accessibility. */
export function IconButton({ variant = 'primary', className, ...props }: IconButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
