/**
 * The two scopes a header notes pad can belong to (renderer). `Global` is the
 * app-wide pad (persisted with a null workspace id); `Worktree` is the active
 * workspace's pad. Values double as the keys of the notes store's per-scope state.
 */

/** Which pad a notes edit targets. */
export enum NoteScope {
  Global = 'global',
  Worktree = 'worktree',
}
