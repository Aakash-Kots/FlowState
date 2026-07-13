'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';

///////////
// Types //
///////////

// Presentational alignment prop — intentionally a string-literal union, not an enum (conventions §4).
type Align = 'start' | 'end';

type DropdownMenuProps = {
  /** Rendered inside the trigger button. */
  trigger: ReactNode;
  triggerClassName?: string;
  /** Which edge the panel aligns to. */
  align?: Align;
  disabled?: boolean;
  /** Panel body. Receives a `close` callback to dismiss after a selection. */
  children: (close: () => void) => ReactNode;
};

type DropdownItemProps = {
  onSelect: () => void;
  selected?: boolean;
  disabled?: boolean;
  children: ReactNode;
};

/////////////////
// Primitives  //
/////////////////

/**
 * A minimal dependency-free dropdown: a trigger button and an absolutely
 * positioned panel that opens upward (it lives inside the bottom input bar).
 * Closes on outside click or Escape.
 */
export function DropdownMenu({
  trigger,
  triggerClassName,
  align = 'start',
  disabled,
  children,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md text-xs transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={cn(
            'absolute bottom-full z-50 mb-1.5 min-w-[15rem] overflow-hidden rounded-lg border border-edge bg-raised p-1 shadow-xl',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** A single selectable row within a `DropdownMenu` panel. */
export function DropdownItem({ onSelect, selected, disabled, children }: DropdownItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
        'hover:bg-edge focus:bg-edge focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'text-neutral-100' : 'text-neutral-300',
      )}
    >
      {children}
    </button>
  );
}
