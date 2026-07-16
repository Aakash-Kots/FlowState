/**
 * Linear control plane — a thin door over `linearService`. Powers the Linear tab:
 * browse team issues, read a team's workflow states + org users, write back an
 * issue's state / assignee, and join issues to the local worktrees linked to
 * them. Auth lives on the onboarding router / AuthService.
 */
import {
  type LinearIssue,
  type LinearIssueRef,
  type LinearTeam,
  type LinearUser,
  type LinearWorkflowState,
  type LinkedWorktree,
  linearIssueRefSchema,
  linearIssueSchema,
  linearTeamSchema,
  linearUserSchema,
  linearWorkflowStateSchema,
  linkedWorktreeSchema,
  listLinearIssuesInputSchema,
  setIssueAssigneeInputSchema,
  setIssueStateInputSchema,
  workflowStatesInputSchema,
} from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { linearService } from '../services/linear';
import { listWorkspaces } from '../store/workspaces';
import { publicProcedure, router } from '../trpc';

const myIssuesSchema = z.array(linearIssueRefSchema);
const issuesSchema = z.array(linearIssueSchema);
const teamsSchema = z.array(linearTeamSchema);
const workflowStatesSchema = z.array(linearWorkflowStateSchema);
const usersSchema = z.array(linearUserSchema);
const linkedWorktreesSchema = z.array(linkedWorktreeSchema);

/** Wrap a Linear call, surfacing its message as an INTERNAL_SERVER_ERROR. */
async function guard<T>(fn: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: err instanceof Error ? err.message : fallback,
    });
  }
}

export const linearRouter = router({
  /** Issues assigned to the linked user (all states), newest first. */
  myIssues: publicProcedure.query((): Promise<LinearIssueRef[]> =>
    guard(async () => myIssuesSchema.parse(await linearService.myIssues()), 'Failed to load Linear issues.'),
  ),

  /** The linked account's teams — the browser's top-level filter. */
  teams: publicProcedure.query((): Promise<LinearTeam[]> =>
    guard(async () => teamsSchema.parse(await linearService.teams()), 'Failed to load Linear teams.'),
  ),

  /** Browse issues, optionally scoped to a team and/or a title text query. */
  issues: publicProcedure
    .input(listLinearIssuesInputSchema)
    .query(({ input }): Promise<LinearIssue[]> =>
      guard(async () => issuesSchema.parse(await linearService.issues(input)), 'Failed to load Linear issues.'),
    ),

  /** A team's workflow states, ordered by position (for the status dropdown). */
  workflowStates: publicProcedure
    .input(workflowStatesInputSchema)
    .query(({ input }): Promise<LinearWorkflowState[]> =>
      guard(
        async () => workflowStatesSchema.parse(await linearService.workflowStates(input.teamId)),
        'Failed to load workflow states.',
      ),
    ),

  /** Active org users — the assignee picker's options. */
  users: publicProcedure.query((): Promise<LinearUser[]> =>
    guard(async () => usersSchema.parse(await linearService.users()), 'Failed to load Linear users.'),
  ),

  /** The linked account's own user (for "Assign to me"). */
  viewer: publicProcedure.query((): Promise<LinearUser> =>
    guard(async () => linearUserSchema.parse(await linearService.viewer()), 'Failed to load your Linear account.'),
  ),

  /** Move an issue to a different workflow state. */
  setIssueState: publicProcedure
    .input(setIssueStateInputSchema)
    .mutation(({ input }): Promise<LinearIssue> =>
      guard(
        async () => linearIssueSchema.parse(await linearService.setIssueState(input)),
        'Failed to update the issue state.',
      ),
    ),

  /** (Re)assign an issue (`assigneeId: null` unassigns). */
  setIssueAssignee: publicProcedure
    .input(setIssueAssigneeInputSchema)
    .mutation(({ input }): Promise<LinearIssue> =>
      guard(
        async () => linearIssueSchema.parse(await linearService.setIssueAssignee(input)),
        'Failed to reassign the issue.',
      ),
    ),

  /**
   * Local worktrees linked to a Linear issue — the join the browser uses to show
   * which worktrees are running against a ticket. Cross-project; the renderer
   * groups by `issueId`.
   */
  linkedWorktrees: publicProcedure.query((): LinkedWorktree[] =>
    linkedWorktreesSchema.parse(
      listWorkspaces()
        .filter((ws) => ws.linearIssue && !ws.archivedAt)
        .map((ws) => ({
          issueId: ws.linearIssue!.id,
          workspaceId: ws.id,
          projectId: ws.projectId,
          name: ws.name,
          branch: ws.branch,
          claudeState: ws.claudeState,
        })),
    ),
  ),
});
