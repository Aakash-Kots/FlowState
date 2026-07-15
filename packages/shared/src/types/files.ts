/**
 * File domain types — reading and writing arbitrary files inside a workspace's
 * worktree, keyed by a worktree-relative path. Powers the ⌘P file finder and the
 * in-tab code editor. Validation lives in `../schemas/files`.
 */

/** One file listed by the finder (a worktree-relative path). */
export type FileEntry = {
  path: string;
};

/** A file's full text, echoed back with the worktree-relative path it came from. */
export type FileContent = {
  path: string;
  content: string;
};

/** List every file (tracked + untracked, honoring .gitignore) in a workspace. */
export type FilesListInput = {
  workspaceId: string;
};

/**
 * List every file in a project's local clone — the candidate set for the `@`
 * file-mention menu in the create-worktree modal, which has no worktree yet.
 */
export type FilesListForProjectInput = {
  projectId: string;
};

/** Read a single worktree-relative file's contents. */
export type FileReadInput = {
  workspaceId: string;
  path: string;
};

/** Overwrite a single worktree-relative file's contents. */
export type FileWriteInput = {
  workspaceId: string;
  path: string;
  content: string;
};
