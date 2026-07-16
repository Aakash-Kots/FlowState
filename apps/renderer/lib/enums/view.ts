/**
 * Top-level view modes for a selected worktree (renderer). The workspace shell
 * toggles between the Claude chat tabs and the git changes manager. Enum order
 * drives both the header tab strip and `cycleViewMode`. Terminals are not a
 * top-level view — they live in the chat view's right-hand panel.
 */

/** Which surface a selected worktree is showing. */
export enum WorkspaceView {
  Workspace = 'workspace',
  Git = 'git',
}
