/**
 * Workspace-related constants shared across the main process and renderer.
 */

/**
 * The single workspace id used while FlowState runs one workspace at a time.
 * Worktree-per-workspace (multiple ids) comes later; until then both processes
 * agree on this id so the renderer and main talk about the same session.
 */
export const DEFAULT_WORKSPACE_ID = 'default';
