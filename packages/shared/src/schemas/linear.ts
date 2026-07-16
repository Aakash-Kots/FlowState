/**
 * Runtime validation for the Linear domain. Mirrors `../types/linear`.
 */
import { z } from 'zod';
import { ClaudeSessionState } from '../enums/claude';
import { LinearStateType } from '../enums/linear';
import type {
  LinearIssue,
  LinearIssueRef,
  LinearTeam,
  LinearUser,
  LinearWorkflowState,
  LinkedWorktree,
  ListLinearIssuesInput,
  SetIssueAssigneeInput,
  SetIssueStateInput,
  WorkflowStatesInput,
} from '../types/linear';

export const linearIssueRefSchema: z.ZodType<LinearIssueRef> = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  url: z.string().url(),
  branchName: z.string(),
  stateName: z.string().optional(),
});

export const linearWorkflowStateSchema: z.ZodType<LinearWorkflowState> = z.object({
  id: z.string(),
  name: z.string(),
  type: z.nativeEnum(LinearStateType),
  color: z.string(),
  position: z.number(),
});

export const linearUserSchema: z.ZodType<LinearUser> = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
});

export const linearIssueSchema: z.ZodType<LinearIssue> = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string().url(),
  branchName: z.string(),
  priority: z.number(),
  updatedAt: z.string(),
  teamId: z.string(),
  state: z.object({
    id: z.string(),
    name: z.string(),
    type: z.nativeEnum(LinearStateType),
    color: z.string(),
  }),
  assignee: z
    .object({
      id: z.string(),
      name: z.string(),
      avatarUrl: z.string().optional(),
    })
    .nullable(),
});

export const linearTeamSchema: z.ZodType<LinearTeam> = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});

export const linkedWorktreeSchema: z.ZodType<LinkedWorktree> = z.object({
  issueId: z.string(),
  workspaceId: z.string(),
  projectId: z.string().nullable(),
  name: z.string(),
  branch: z.string(),
  claudeState: z.nativeEnum(ClaudeSessionState),
});

export const listLinearIssuesInputSchema: z.ZodType<ListLinearIssuesInput> = z.object({
  teamId: z.string().optional(),
  query: z.string().optional(),
  includeCompleted: z.boolean().optional(),
});

export const workflowStatesInputSchema: z.ZodType<WorkflowStatesInput> = z.object({
  teamId: z.string(),
});

export const setIssueStateInputSchema: z.ZodType<SetIssueStateInput> = z.object({
  issueId: z.string(),
  stateId: z.string(),
});

export const setIssueAssigneeInputSchema: z.ZodType<SetIssueAssigneeInput> = z.object({
  issueId: z.string(),
  assigneeId: z.string().nullable(),
});
