/**
 * Worktree + file-linking constants (main-process only — these drive
 * filesystem paths and `git worktree` layout, so they never cross into shared).
 */

/**
 * Sibling directory (next to the repo clone) that holds a project's worktrees,
 * e.g. `~/FlowState/projects/acme-worktrees/<branch-slug>`. Kept out of the
 * repo tree so it never nests inside `.git` or shows up in the checkout.
 */
export const WORKTREES_DIR_SUFFIX = '-worktrees';

/**
 * Root-level files matching this pattern are auto-linked into a new worktree
 * (`.env`, `.env.local`, `.env.production`, …) — the gitignored config a clone
 * needs but a fresh worktree lacks.
 */
export const ENV_FILE_PATTERN = /^\.env(\..+)?$/;
