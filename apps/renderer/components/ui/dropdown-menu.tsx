'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';

///////////
// Types //
///////////

// Presentational props — intentionally string-literal unions, not enums (conventions §4).
type Align = 'start' | 'end';
type Placement = 'top' | 'bottom';

type DropdownMenuProps = {
  /** Rendered inside the trigger button. */
  trigger: ReactNode;
  triggerClassName?: string;
  /** Extra classes for the popup panel (e.g. to override its background). */
  panelClassName?: string;
  /** Which edge the panel aligns to. */
  align?: Align;
  /** Whether the panel opens above (`top`) or below (`bottom`) the trigger. */
  placement?: Placement;
  disabled?: boolean;
  /** Called whenever the panel opens or closes (e.g. to refresh data on open). */
  onOpenChange?: (open: boolean) => void;
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
  panelClassName,
  align = 'start',
  placement = 'top',
  disabled,
  onOpenChange,
  children,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const setOpenState = (next: boolean) => {
    setOpen((prev) => {
      if (prev !== next) onOpenChange?.(next);
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenState(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenState(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpenState(!open)}
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
            'absolute z-50 min-w-[15rem] overflow-hidden rounded-lg border border-border bg-muted p-1 shadow-xl',
            placement === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
            align === 'end' ? 'right-0' : 'left-0',
            panelClassName,
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
        'hover:bg-accent focus:bg-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'text-neutral-100' : 'text-neutral-300',
      )}
    >
      {children}
    </button>
  );
}
