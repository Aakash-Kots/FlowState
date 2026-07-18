/**
 * Types for the header notes pads — a freeform Markdown scratchpad (prose,
 * bullets, checkable tasks) the user jots into from the app header. Two scopes
 * exist: the app-wide Global pad (`workspaceId` null) and a per-worktree pad
 * (`workspaceId` set). Validation lives in `../schemas/notes`.
 */

/**
 * One persisted notes pad. `workspaceId` null is the app-wide Global pad; a set
 * `workspaceId` scopes the pad to that worktree. `body` is the pad's Markdown
 * content; `updatedAt` is the last-saved ISO timestamp.
 */
export type Note = {
  id: string;
  workspaceId: string | null;
  body: string;
  updatedAt: string;
};
