/**
 * LinearService — talks to Linear via @linear/sdk using the OAuth token captured
 * on the Connect screen (encrypted with Electron safeStorage). Lists the issues
 * assigned to the linked user so a worktree can be linked + named from a ticket.
 * The auth flow itself lives in `linear-oauth.ts` / `AuthService`.
 */
import { LinearClient } from '@linear/sdk';
import type { LinearIssueRef } from '@flowstate/shared';
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

export class LinearService {
  /** The linked account's OAuth token, or throw a Connect-first error. */
  private token(): string {
    const token = getSecret(SecretName.LinearToken);
    if (!token) {
      throw new Error('No linked Linear account. Connect Linear from the Connect screen first.');
    }
    return token;
  }

  /** Issues assigned to the linked user (all states), most-recently-updated first. */
  async myIssues(): Promise<LinearIssueRef[]> {
    const client = new LinearClient({ accessToken: this.token() });
    const { data } = await client.client.rawRequest<AssignedIssuesData, { first: number }>(
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
}

/** Shared singleton — mirrors `githubService`. */
export const linearService = new LinearService();
