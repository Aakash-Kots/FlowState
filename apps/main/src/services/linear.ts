/**
 * LinearService — talks to Linear via @linear/sdk using the OAuth token captured
 * on the Connect screen (encrypted with Electron safeStorage). Powers the Linear
 * tab: browse team issues, read a team's workflow states + org users, and write
 * back an issue's state / assignee. Also lists the issues assigned to the linked
 * user so a worktree can be linked + named from a ticket. The auth flow itself
 * lives in `linear-oauth.ts` / `AuthService`.
 */
import { LinearClient } from '@linear/sdk';
import type {
  LinearIssue,
  LinearIssueRef,
  LinearStateType,
  LinearTeam,
  LinearUser,
  LinearWorkflowState,
  ListLinearIssuesInput,
  SetIssueAssigneeInput,
  SetIssueStateInput,
} from '@flowstate/shared';
import { SecretName } from '../lib/enums/secret';
import { getSecret } from '../store/secrets';

/////////////
// Helpers //
/////////////

/** GraphQL for the linked user's assigned issues (all states), newest first. */
const ASSIGNED_ISSUES_QUERY = `
  query AssignedIssues($first: Int!) {
    viewer {
      assignedIssues(first: $first, orderBy: updatedAt) {
        nodes { id identifier title url branchName state { name } }
      }
    }
  }
`;

/** Shared issue selection — every browse/detail/write query returns this shape. */
const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  url
  branchName
  priority
  updatedAt
  team { id }
  state { id name type color }
  assignee { id name avatarUrl }
`;

const TEAMS_QUERY = `
  query Teams($first: Int!) {
    teams(first: $first, orderBy: updatedAt) {
      nodes { id key name }
    }
  }
`;

const ISSUES_QUERY = `
  query Issues($first: Int!, $filter: IssueFilter) {
    issues(first: $first, filter: $filter, orderBy: updatedAt) {
      nodes { ${ISSUE_FIELDS} }
    }
  }
`;

const WORKFLOW_STATES_QUERY = `
  query WorkflowStates($teamId: ID!, $first: Int!) {
    workflowStates(first: $first, filter: { team: { id: { eq: $teamId } } }) {
      nodes { id name type color position }
    }
  }
`;

const USERS_QUERY = `
  query Users($first: Int!) {
    users(first: $first, filter: { active: { eq: true } }) {
      nodes { id name displayName avatarUrl }
    }
  }
`;

const VIEWER_QUERY = `
  query Viewer {
    viewer { id name displayName avatarUrl }
  }
`;

const ISSUE_UPDATE_MUTATION = `
  mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue { ${ISSUE_FIELDS} }
    }
  }
`;

/** The raw GraphQL shape of an issue node (before mapping to `LinearIssue`). */
type IssueNode = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  branchName: string;
  priority: number;
  updatedAt: string;
  team: { id: string } | null;
  state: { id: string; name: string; type: string; color: string } | null;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
};

type AssignedIssuesData = {
  viewer: {
    assignedIssues: {
      nodes: Array<{
        id: string;
        identifier: string;
        title: string;
        url: string;
        branchName: string;
        state: { name: string } | null;
      }>;
    };
  };
};

/** IssueFilter fragment excluding done/cancelled issues from the browser. */
const ACTIVE_STATE_FILTER = { state: { type: { nin: ['completed', 'canceled'] } } };

/** Map a raw GraphQL issue node to the shared `LinearIssue` shape. */
function toLinearIssue(n: IssueNode): LinearIssue {
  return {
    id: n.id,
    identifier: n.identifier,
    title: n.title,
    description: n.description ?? null,
    url: n.url,
    branchName: n.branchName,
    priority: n.priority,
    updatedAt: n.updatedAt,
    teamId: n.team?.id ?? '',
    state: {
      id: n.state?.id ?? '',
      name: n.state?.name ?? '',
      type: (n.state?.type ?? 'backlog') as LinearStateType,
      color: n.state?.color ?? '#8a8f98',
    },
    assignee: n.assignee
      ? { id: n.assignee.id, name: n.assignee.name, avatarUrl: n.assignee.avatarUrl ?? undefined }
      : null,
  };
}

export class LinearService {
  /** The linked account's OAuth token, or throw a Connect-first error. */
  private token(): string {
    const token = getSecret(SecretName.LinearToken);
    if (!token) {
      throw new Error('No linked Linear account. Connect Linear from the Connect screen first.');
    }
    return token;
  }

  /** A fresh SDK client bound to the linked account's token. */
  private client(): LinearClient {
    return new LinearClient({ accessToken: this.token() });
  }

  /** Issues assigned to the linked user (all states), most-recently-updated first. */
  async myIssues(): Promise<LinearIssueRef[]> {
    const { data } = await this.client().client.rawRequest<AssignedIssuesData, { first: number }>(
      ASSIGNED_ISSUES_QUERY,
      { first: 100 },
    );
    return (data?.viewer.assignedIssues.nodes ?? []).map((n) => ({
      id: n.id,
      identifier: n.identifier,
      title: n.title,
      url: n.url,
      branchName: n.branchName,
      stateName: n.state?.name,
    }));
  }

  /** The linked account's teams — the browser's top-level filter. */
  async teams(): Promise<LinearTeam[]> {
    const { data } = await this.client().client.rawRequest<
      { teams: { nodes: LinearTeam[] } },
      { first: number }
    >(TEAMS_QUERY, { first: 250 });
    return data?.teams.nodes ?? [];
  }

  /** Browse issues, optionally scoped to a team and/or a title text query. */
  async issues(input: ListLinearIssuesInput): Promise<LinearIssue[]> {
    const filter: Record<string, unknown> = {};
    if (input.teamId) filter.team = { id: { eq: input.teamId } };
    if (!input.includeCompleted) Object.assign(filter, ACTIVE_STATE_FILTER);
    const q = input.query?.trim();
    if (q) filter.title = { containsIgnoreCase: q };

    const { data } = await this.client().client.rawRequest<
      { issues: { nodes: IssueNode[] } },
      { first: number; filter: Record<string, unknown> }
    >(ISSUES_QUERY, { first: 100, filter });
    return (data?.issues.nodes ?? []).map(toLinearIssue);
  }

  /** A team's workflow states, ordered by workflow position (for the status menu). */
  async workflowStates(teamId: string): Promise<LinearWorkflowState[]> {
    const { data } = await this.client().client.rawRequest<
      { workflowStates: { nodes: Array<Omit<LinearWorkflowState, 'type'> & { type: string }> } },
      { teamId: string; first: number }
    >(WORKFLOW_STATES_QUERY, { teamId, first: 250 });
    return (data?.workflowStates.nodes ?? [])
      .map((s) => ({ ...s, type: s.type as LinearStateType }))
      .sort((a, b) => a.position - b.position);
  }

  /** Active org users — the assignee picker's options. */
  async users(): Promise<LinearUser[]> {
    const { data } = await this.client().client.rawRequest<
      { users: { nodes: Array<LinearUser & { avatarUrl: string | null }> } },
      { first: number }
    >(USERS_QUERY, { first: 250 });
    return (data?.users.nodes ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl ?? undefined,
    }));
  }

  /** The linked account's own user (for "Assign to me"). */
  async viewer(): Promise<LinearUser> {
    const { data } = await this.client().client.rawRequest<
      { viewer: LinearUser & { avatarUrl: string | null } },
      Record<string, never>
    >(VIEWER_QUERY, {});
    const v = data?.viewer;
    if (!v) throw new Error('Failed to load the linked Linear account.');
    return { id: v.id, name: v.name, displayName: v.displayName, avatarUrl: v.avatarUrl ?? undefined };
  }

  /** Move an issue to a different workflow state; returns the updated issue. */
  async setIssueState(input: SetIssueStateInput): Promise<LinearIssue> {
    return this.updateIssue(input.issueId, { stateId: input.stateId });
  }

  /** (Re)assign an issue (`assigneeId: null` unassigns); returns the updated issue. */
  async setIssueAssignee(input: SetIssueAssigneeInput): Promise<LinearIssue> {
    return this.updateIssue(input.issueId, { assigneeId: input.assigneeId });
  }

  /** Run an `issueUpdate` mutation and return the freshly-read issue. */
  private async updateIssue(id: string, input: Record<string, unknown>): Promise<LinearIssue> {
    const { data } = await this.client().client.rawRequest<
      { issueUpdate: { success: boolean; issue: IssueNode | null } },
      { id: string; input: Record<string, unknown> }
    >(ISSUE_UPDATE_MUTATION, { id, input });
    if (!data?.issueUpdate.success || !data.issueUpdate.issue) {
      throw new Error('Linear rejected the issue update.');
    }
    return toLinearIssue(data.issueUpdate.issue);
  }
}

/** Shared singleton — mirrors `githubService`. */
export const linearService = new LinearService();
