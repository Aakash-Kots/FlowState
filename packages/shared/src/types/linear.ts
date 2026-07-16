/**
 * Linear integration types. Validation lives in `../schemas/linear`.
 */
import type { ClaudeSessionState } from '../enums/claude';
import type { LinearStateType } from '../enums/linear';

/**
 * A Linear issue reference linked to a workspace. Kept intentionally small —
 * the full issue lives in Linear; FlowState stores just enough to display and
 * link back.
 */
export type LinearIssueRef = {
  id: string;
  identifier: string; // e.g. "ENG-142"
  title: string;
  url: string;
  /** Linear's suggested git branch name, e.g. "aakash/eng-142-fix-login". */
  branchName: string;
  stateName?: string;
};

/** A workflow state as configured on a team (dynamic — names/colours vary). */
export type LinearWorkflowState = {
  id: string;
  name: string;
  /** The fixed category this state belongs to. */
  type: LinearStateType;
  /** Hex colour Linear assigns the state, e.g. "#5e6ad2". */
  color: string;
  /** Sort position within the team's workflow (ascending). */
  position: number;
};

/** A Linear user — the assignee picker's options. */
export type LinearUser = {
  id: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
};

/**
 * A richer issue row for the browser/detail views — more than the small
 * `LinearIssueRef` we persist on a workspace. The full body lives in Linear.
 */
export type LinearIssue = {
  id: string;
  identifier: string; // e.g. "ENG-142"
  title: string;
  url: string;
  /** Linear's suggested git branch name (seeds a linked worktree's branch). */
  branchName: string;
  /** Linear priority: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
  priority: number;
  /** ISO timestamp of the last update (issues are ordered by this). */
  updatedAt: string;
  /** Owning team — scopes which workflow states apply to this issue. */
  teamId: string;
  state: {
    id: string;
    name: string;
    type: LinearStateType;
    color: string;
  };
  assignee: {
    id: string;
    name: string;
    avatarUrl?: string;
  } | null;
};

/** A Linear team — the browser's top-level filter. */
export type LinearTeam = {
  id: string;
  key: string; // e.g. "ENG"
  name: string;
};

/**
 * A local worktree linked to a Linear issue — the join between FlowState's
 * workspaces and the issue browser. Lets the Linear tab show which worktrees are
 * running against a given ticket.
 */
export type LinkedWorktree = {
  issueId: string;
  workspaceId: string;
  projectId: string | null;
  name: string;
  branch: string;
  claudeState: ClaudeSessionState;
};

/** Input to browse issues: optionally scoped to a team and/or a text query. */
export type ListLinearIssuesInput = {
  teamId?: string;
  query?: string;
  /** Include completed/canceled issues (excluded by default). */
  includeCompleted?: boolean;
};

/** Input to fetch a team's workflow states (for the status dropdown). */
export type WorkflowStatesInput = {
  teamId: string;
};

/** Input to move an issue to a different workflow state. */
export type SetIssueStateInput = {
  issueId: string;
  stateId: string;
};

/** Input to (re)assign an issue; `assigneeId: null` unassigns. */
export type SetIssueAssigneeInput = {
  issueId: string;
  assigneeId: string | null;
};
