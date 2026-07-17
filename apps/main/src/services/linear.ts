/**
 * LinearService — talks to Linear via @linear/sdk using the OAuth token captured
 * on the Connect screen (encrypted with Electron safeStorage). Powers the Linear
 * command center: browse/filter issues (with their linked GitHub PR read from
 * attachments), read a team's workflow states, org users, projects, and labels,
 * write back an issue's state / assignee, and create new issues. Also lists the
 * issues assigned to the linked user so a worktree can be linked + named from a
 * ticket. The auth flow itself lives in `linear-oauth.ts` / `AuthService`.
 */
import { LinearClient } from '@linear/sdk';
import { LinearPrStatus } from '@flowstate/shared';
import type {
  CreateLinearIssueInput,
  LinearIssue,
  LinearIssueRef,
  LinearLabel,
  LinearPrRef,
  LinearProject,
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
  attachments(first: 20) { nodes { url title sourceType metadata } }
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

const ISSUE_BY_ID_QUERY = `
  query Issue($id: String!) {
    issue(id: $id) { ${ISSUE_FIELDS} }
  }
`;

const SUB_ISSUES_QUERY = `
  query SubIssues($id: String!, $first: Int!) {
    issue(id: $id) {
      children(first: $first) { nodes { ${ISSUE_FIELDS} } }
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

const ISSUE_CREATE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { ${ISSUE_FIELDS} }
    }
  }
`;

const PROJECTS_QUERY = `
  query Projects($first: Int!) {
    projects(first: $first) {
      nodes { id name }
    }
  }
`;

const TEAM_PROJECTS_QUERY = `
  query TeamProjects($teamId: String!, $first: Int!) {
    team(id: $teamId) {
      projects(first: $first) { nodes { id name } }
    }
  }
`;

const LABELS_QUERY = `
  query IssueLabels($first: Int!, $filter: IssueLabelFilter) {
    issueLabels(first: $first, filter: $filter) {
      nodes { id name color }
    }
  }
`;

/** The raw GraphQL shape of an attachment node (source of the PR link). */
type AttachmentNode = {
  url: string;
  title: string | null;
  sourceType: string | null;
  /** Untyped JSON — shape varies by source; PR state lives in here for GitHub. */
  metadata: Record<string, unknown> | null;
};

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
  attachments: { nodes: AttachmentNode[] } | null;
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

/** Matches a GitHub pull-request URL and captures its number. */
const GITHUB_PR_URL = /github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/i;

/** Map a raw Linear-attachment status string to our PR-status enum. */
function toPrStatus(raw: unknown): LinearPrStatus {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s.includes('merge')) return LinearPrStatus.Merged;
  if (s.includes('close')) return LinearPrStatus.Closed;
  if (s.includes('draft')) return LinearPrStatus.Draft;
  return LinearPrStatus.Open; // open, or unknown-but-present
}

/**
 * Pick the GitHub pull-request attachment (if any) and read its state. PR status
 * is NOT a Linear schema field — it lives in the attachment's untyped `metadata`
 * JSON, whose shape varies by version — so this reads defensively and defaults to
 * `Open` whenever a PR url exists but its state can't be determined.
 */
function toPrRef(attachments: AttachmentNode[]): LinearPrRef | null {
  for (const a of attachments) {
    const match = a.url?.match(GITHUB_PR_URL);
    if (!match) continue;
    if (a.sourceType && !a.sourceType.toLowerCase().includes('github')) continue;
    const meta = a.metadata ?? {};
    const status = meta.draft === true ? LinearPrStatus.Draft : toPrStatus(meta.status ?? meta.state);
    return { url: a.url, number: Number(match[1]), status };
  }
  return null;
}

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
    pr: toPrRef(n.attachments?.nodes ?? []),
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

  /** Browse issues with the command-center filters (team, text, assignee, …). */
  async issues(input: ListLinearIssuesInput): Promise<LinearIssue[]> {
    const filter: Record<string, unknown> = {};
    if (input.teamId) filter.team = { id: { eq: input.teamId } };
    if (!input.includeCompleted) Object.assign(filter, ACTIVE_STATE_FILTER);
    const q = input.query?.trim();
    if (q) {
      // Match title or description; identifier has no filter field (it's team key +
      // number), so a trailing number ("ENG-142", "142") is matched via `number`.
      const or: Record<string, unknown>[] = [
        { title: { containsIgnoreCase: q } },
        { description: { containsIgnoreCase: q } },
      ];
      const num = q.match(/(\d+)\s*$/);
      if (num) or.push({ number: { eq: Number(num[1]) } });
      filter.or = or;
    }
    if (input.assigneeId) filter.assignee = { id: { eq: input.assigneeId } };
    if (input.stateIds?.length) filter.state = { id: { in: input.stateIds } };
    if (input.priorities?.length) filter.priority = { in: input.priorities };
    if (input.labelIds?.length) filter.labels = { some: { id: { in: input.labelIds } } };
    if (input.projectId) filter.project = { id: { eq: input.projectId } };

    const { data } = await this.client().client.rawRequest<
      { issues: { nodes: IssueNode[] } },
      { first: number; filter: Record<string, unknown> }
    >(ISSUES_QUERY, { first: 100, filter });
    return (data?.issues.nodes ?? []).map(toLinearIssue);
  }

  /** A single full issue by id (the hover card + worktree seed context); null if gone. */
  async issue(id: string): Promise<LinearIssue | null> {
    const { data } = await this.client().client.rawRequest<
      { issue: IssueNode | null },
      { id: string }
    >(ISSUE_BY_ID_QUERY, { id });
    return data?.issue ? toLinearIssue(data.issue) : null;
  }

  /** A parent issue's sub-issues (children), mapped to full issues; [] if none. */
  async subIssues(id: string): Promise<LinearIssue[]> {
    const { data } = await this.client().client.rawRequest<
      { issue: { children: { nodes: IssueNode[] } } | null },
      { id: string; first: number }
    >(SUB_ISSUES_QUERY, { id, first: 100 });
    return (data?.issue?.children.nodes ?? []).map(toLinearIssue);
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

  /** Create an issue and return it (drops undefined fields from the input). */
  async createIssue(input: CreateLinearIssueInput): Promise<LinearIssue> {
    const payload = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    );
    const { data } = await this.client().client.rawRequest<
      { issueCreate: { success: boolean; issue: IssueNode | null } },
      { input: Record<string, unknown> }
    >(ISSUE_CREATE_MUTATION, { input: payload });
    if (!data?.issueCreate.success || !data.issueCreate.issue) {
      throw new Error('Linear rejected the new issue.');
    }
    return toLinearIssue(data.issueCreate.issue);
  }

  /** Projects, optionally scoped to a team — the browser filter + create picker. */
  async projects(teamId?: string): Promise<LinearProject[]> {
    if (teamId) {
      const { data } = await this.client().client.rawRequest<
        { team: { projects: { nodes: LinearProject[] } } | null },
        { teamId: string; first: number }
      >(TEAM_PROJECTS_QUERY, { teamId, first: 250 });
      return data?.team?.projects.nodes ?? [];
    }
    const { data } = await this.client().client.rawRequest<
      { projects: { nodes: LinearProject[] } },
      { first: number }
    >(PROJECTS_QUERY, { first: 250 });
    return data?.projects.nodes ?? [];
  }

  /** Issue labels, optionally scoped to a team — the create-ticket label picker. */
  async labels(teamId?: string): Promise<LinearLabel[]> {
    const filter = teamId ? { team: { id: { eq: teamId } } } : undefined;
    const { data } = await this.client().client.rawRequest<
      { issueLabels: { nodes: LinearLabel[] } },
      { first: number; filter?: Record<string, unknown> }
    >(LABELS_QUERY, { first: 250, filter });
    return data?.issueLabels.nodes ?? [];
  }
}

/** Shared singleton — mirrors `githubService`. */
export const linearService = new LinearService();
