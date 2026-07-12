/**
 * Workspace domain types — FlowState's core unit: a git worktree plus its
 * terminals, Claude Code session, and optional Linear issue. Validation lives in
 * `../schemas/workspace`.
 */
import type { ClaudeSessionState } from '../enums/claude';
import type { LinearIssueRef } from './linear';

/**
 * A Workspace is FlowState's core unit: one git worktree plus its terminals,
 * Claude Code session, and an optionally linked Linear issue.
 */
export type Workspace = {
  id: string;
  name: string;
  repoRoot: string; // the primary repository path
  worktreePath: string; // absolute path of this worktree
  branch: string;
  linearIssue: LinearIssueRef | null;
  claudeState: ClaudeSessionState;
  claudeSessionId: string | null;
  createdAt: string;
};

/** Input to create a new workspace (worktree + branch). */
export type CreateWorkspaceInput = {
  repoRoot: string;
  branch: string;
  baseRef: string;
  linearIssueId?: string;
};
