/**
 * Workspace-related constants shared across the main process and renderer.
 */

/**
 * The single workspace id used while FlowState runs one workspace at a time.
 * Worktree-per-workspace (multiple ids) comes later; until then both processes
 * agree on this id so the renderer and main talk about the same session.
 */
export const DEFAULT_WORKSPACE_ID = 'default';

/**
 * Display name a worktree carries until its first chat auto-names it (mirrors the
 * tab auto-title flow). Also the sentinel the auto-title/branch-rename path keys
 * off: while the name still equals this, the worktree is treated as unnamed.
 */
export const UNTITLED_WORKSPACE_NAME = 'Untitled';
