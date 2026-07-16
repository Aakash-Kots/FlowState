'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from './cn';
import { Button } from './Button';

///////////
// Types //
///////////

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Render the confirm button as a destructive action (danger text). */
  destructive?: boolean;
};

//////////////////
// Primary view //
//////////////////

/**
 * A small confirmation modal — title, description, and a Cancel + confirm pair.
 * Built on Radix Dialog so it traps focus and dismisses on Escape / overlay
 * click (both routed through `onOpenChange`).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-background p-5 shadow-2xl shadow-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="flex flex-col gap-1.5">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className={cn(destructive && 'text-danger')}
              variant="secondary"
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
