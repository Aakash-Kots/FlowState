/**
 * Top-level view modes for a selected worktree (renderer). The workspace shell
 * toggles between the Claude chat tabs and the terminal tabs.
 */

/** Which surface a selected worktree is showing. */
export enum WorkspaceView {
  Workspace = 'workspace',
  Terminals = 'terminals',
}
