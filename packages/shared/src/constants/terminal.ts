/**
 * Terminal-related constants shared across the main process and renderer.
 */

/**
 * Maximum ad-hoc shell terminals open at once per workspace/worktree. The two
 * default tabs (Setup + Run) are always present on top of this cap.
 */
export const MAX_TERMINALS_PER_WORKSPACE = 8;

/** Title given to a freshly-opened shell terminal. */
export const DEFAULT_TERMINAL_TITLE = 'Terminal';

/** Title of the project-scoped Setup default tab. */
export const SETUP_TAB_TITLE = 'Setup';

/** Title of the project-scoped Run default tab. */
export const RUN_TAB_TITLE = 'Run';
