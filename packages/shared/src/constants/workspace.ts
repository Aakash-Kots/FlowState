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
 * tab auto-title flow). The rename path keys off this exact value.
 */
export const UNTITLED_WORKSPACE_NAME = 'Untitled';

/**
 * Prefix for the throwaway branch a worktree is created on (`untitled-<shortid>`).
 * The branch is never renamed — only the workspace's display name is dynamic.
 */
export const UNTITLED_BRANCH_PREFIX = 'untitled';
