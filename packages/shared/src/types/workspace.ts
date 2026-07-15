/**
 * Workspace domain types — FlowState's core unit: a git worktree plus its
 * terminals, Claude Code session, and optional Linear issue. Validation lives in
 * `../schemas/workspace`.
 */
import type { ClaudeSessionState, PermissionMode } from '../enums/claude';
import type { LinearIssueRef } from './linear';

/**
 * A Workspace is FlowState's core unit: one git worktree plus its terminals,
 * Claude Code session, and an optionally linked Linear issue.
 */
export type Workspace = {
  id: string;
  /** Parent project (a cloned repo); null for the legacy single-workspace row. */
  projectId: string | null;
  name: string;
  repoRoot: string; // the primary repository path
  worktreePath: string; // absolute path of this worktree
  branch: string;
  /** The branch this worktree was cut from (the PR base); null for legacy rows. */
  baseRef: string | null;
  linearIssue: LinearIssueRef | null;
  claudeState: ClaudeSessionState;
  claudeSessionId: string | null;
  /**
   * When the user archived this worktree (ISO timestamp), or null while active.
   * An archived worktree is hidden from the sidebar and force-removed from disk
   * by the background reaper once the configured retention delay elapses.
   */
  archivedAt: string | null;
  createdAt: string;
};

/**
 * Broadcast whenever a worktree's display name or branch changes — from the
 * auto-title flow, the manual sidebar rename, or a branch reconciled from disk
 * (the in-chat agent running `git branch -m` itself). The sidebar subscribes
 * once and patches its cached worktree list so every view stays in sync.
 */
export type WorktreeChange = {
  workspaceId: string;
  name: string;
  branch: string;
};

/** Input to rename a worktree: sets its display name (and slugged branch). */
export type RenameWorktreeInput = {
  workspaceId: string;
  name: string;
};

/**
 * One entry in the "recently active" list persisted across reloads: the worktree
 * the user visited and the exact chat tab they had focused (null if unknown).
 * The list is most-recent-first, so its first still-existing entry is what the
 * app reopens on launch.
 */
export type RecentWorkspaceEntry = {
  workspaceId: string;
  tabId: string | null;
};

/** Input to create a new workspace (worktree + branch). */
export type CreateWorkspaceInput = {
  repoRoot: string;
  branch: string;
  baseRef: string;
  linearIssueId?: string;
};

/**
 * Input to create a worktree-workspace under a project: a new git worktree on
 * its own `branch` (cut from `baseRef`, defaulting to the project's default
 * branch), optionally seeded with a first Claude prompt.
 */
export type CreateWorktreeInput = {
  projectId: string;
  baseRef?: string;
  initialPrompt?: string;
  /** Permission mode the first session starts in (e.g. Plan). Defaults to Default. */
  permissionMode?: PermissionMode;
};
