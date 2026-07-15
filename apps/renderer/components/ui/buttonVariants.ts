///////////
// Types //
///////////

// Presentational variant prop — intentionally a string-literal union, not an enum (conventions §4).
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

///////////////
// Constants //
///////////////

/** Per-variant color classes shared by {@link Button} and {@link IconButton}. */
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted',
  secondary:
    'bg-muted text-neutral-200 border border-border hover:bg-accent disabled:text-muted-foreground disabled:hover:bg-muted',
  ghost: 'bg-transparent text-muted-foreground hover:text-neutral-100 hover:bg-muted',
};

/** Focus/disabled base shared by both button primitives. */
export const BUTTON_BASE =
  'transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/60 disabled:cursor-not-allowed';
