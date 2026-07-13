/**
 * Worktree + file-linking constants (main-process only — these drive
 * filesystem paths and `git worktree` layout, so they never cross into shared).
 */
import { ArchiveRetention } from '@flowstate/shared';

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

/**
 * Grace period (ms) each retention choice grants an archived worktree before the
 * reaper force-removes it. `Immediately` is 0 — deleted on the sweep triggered
 * right after archiving.
 */
export const ARCHIVE_RETENTION_MS: Record<ArchiveRetention, number> = {
  [ArchiveRetention.Immediately]: 0,
  [ArchiveRetention.OneHour]: 60 * 60 * 1000,
  [ArchiveRetention.OneDay]: 24 * 60 * 60 * 1000,
  [ArchiveRetention.SevenDays]: 7 * 24 * 60 * 60 * 1000,
};
