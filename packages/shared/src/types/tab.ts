/**
 * Tab domain types — a Tab is a single Claude Code chat session inside a
 * workspace (worktree). A workspace holds up to `MAX_TABS_PER_WORKSPACE` tabs,
 * each with its own transcript, session state, and resume id; all tabs in a
 * workspace share its working folder. Validation lives in `../schemas/tab`.
 */
import type { ClaudeSessionState, ReasoningEffort } from '../enums/claude';

/** One Claude chat session slot within a workspace/worktree. */
export type Tab = {
  id: string;
  workspaceId: string;
  title: string;
  claudeState: ClaudeSessionState;
  claudeSessionId: string | null;
  /** Per-tab Claude model id; null inherits the SDK/CLI default. */
  model: string | null;
  /** Per-tab reasoning effort; null inherits the model default. */
  effort: ReasoningEffort | null;
  position: number;
  createdAt: string;
};

/** Input to open a new tab in a workspace. */
export type CreateTabInput = {
  workspaceId: string;
  title?: string;
};
