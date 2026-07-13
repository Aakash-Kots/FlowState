/**
 * Top-level view modes for a selected worktree (renderer). The workspace shell
 * toggles between the Claude chat tabs, the git changes manager, and the
 * terminal tabs. Enum order drives both the header tab strip and `cycleViewMode`.
 */

/** Which surface a selected worktree is showing. */
export enum WorkspaceView {
  Workspace = 'workspace',
  Git = 'git',
  Terminals = 'terminals',
}
