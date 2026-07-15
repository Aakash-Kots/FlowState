'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

/**
 * App toast host. The renderer is dark-only (see `app/globals.css`), so the
 * theme is fixed to `dark`; toasts are painted with the shared shadcn tokens
 * (`popover`/`border`/`destructive`) so they match every other surface. Mount
 * once in the client shell; fire with the re-exported `toast`.
 */
function Toaster({ ...props }: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          error:
            'group-[.toaster]:border-destructive/40 group-[.toaster]:text-destructive [&_[data-icon]]:text-destructive',
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
