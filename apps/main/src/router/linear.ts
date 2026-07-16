/**
 * Linear control plane — a thin door over `linearService`. Powers the Linear
 * command center: browse/filter issues, read a team's workflow states, org users,
 * projects, and labels, write back an issue's state / assignee, create issues,
 * and join issues to the local worktrees linked to them. Auth lives on the
 * onboarding router / AuthService.
 */
import {
  type LinearIssue,
  type LinearIssueRef,
  type LinearLabel,
  type LinearProject,
  type LinearTeam,
  type LinearUser,
  type LinearWorkflowState,
  type LinkedWorktree,
  createLinearIssueInputSchema,
  getLinearIssueInputSchema,
  linearIssueRefSchema,
  linearIssueSchema,
  linearLabelSchema,
  linearProjectSchema,
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
const projectsSchema = z.array(linearProjectSchema);
const labelsSchema = z.array(linearLabelSchema);
const linkedWorktreesSchema = z.array(linkedWorktreeSchema);

/** Optional team scope shared by the projects + labels procedures. */
const teamScopeSchema = z.object({ teamId: z.string().optional() });

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

  /** A single full issue by id — the ticket hover card's detail source. */
  issue: publicProcedure
    .input(getLinearIssueInputSchema)
    .query(({ input }): Promise<LinearIssue | null> =>
      guard(async () => linearIssueSchema.nullable().parse(await linearService.issue(input.id)), 'Failed to load the issue.'),
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

  /** Create a new issue and return it. */
  createIssue: publicProcedure
    .input(createLinearIssueInputSchema)
    .mutation(({ input }): Promise<LinearIssue> =>
      guard(
        async () => linearIssueSchema.parse(await linearService.createIssue(input)),
        'Failed to create the issue.',
      ),
    ),

  /** Projects, optionally scoped to a team — the browser filter + create picker. */
  projects: publicProcedure
    .input(teamScopeSchema)
    .query(({ input }): Promise<LinearProject[]> =>
      guard(async () => projectsSchema.parse(await linearService.projects(input.teamId)), 'Failed to load projects.'),
    ),

  /** Issue labels, optionally scoped to a team — the create-ticket label picker. */
  labels: publicProcedure
    .input(teamScopeSchema)
    .query(({ input }): Promise<LinearLabel[]> =>
      guard(async () => labelsSchema.parse(await linearService.labels(input.teamId)), 'Failed to load labels.'),
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
