'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import {
  DEFAULT_WORKSPACE_ID,
  type LinearIssue,
  type LinearIssueRef,
  type LinearTeam,
  type LinearUser,
  type LinearWorkflowState,
  type LinkedWorktree,
} from '@flowstate/shared';
import { useOnboarding } from './onboarding';
import { trpc } from './trpc';
import { useWorkspace } from './workspace';

///////////
// Types //
///////////

type LinearStoreState = {
  //// Assigned issues — the New-Worktree modal's "Link Linear issue" combobox. ////
  assignedIssues: LinearIssueRef[];
  assignedLoading: boolean;
  /** True once we've fetched assigned issues at least once (empty-vs-loading UI). */
  assignedLoaded: boolean;
  assignedError: string | null;

  //// Issue browser — the Linear tab. ////
  teams: LinearTeam[];
  /** Active team filter; null means "all teams". */
  selectedTeamId: string | null;
  searchQuery: string;
  issues: LinearIssue[];
  issuesLoading: boolean;
  issuesError: string | null;
  /** The issue open in the detail panel. */
  selectedIssueId: string | null;
  /** A team's workflow states (the status dropdown), cached by team id. */
  workflowStatesByTeam: Record<string, LinearWorkflowState[]>;
  /** Active org users — the assignee picker. */
  users: LinearUser[];
  /** The linked account's own user (for "Assign to me"). */
  viewer: LinearUser | null;
  /** Local worktrees linked to an issue, keyed by issue id after grouping. */
  linkedWorktrees: LinkedWorktree[];
};

///////////////
// Constants //
///////////////

const INITIAL: LinearStoreState = {
  assignedIssues: [],
  assignedLoading: false,
  assignedLoaded: false,
  assignedError: null,
  teams: [],
  selectedTeamId: null,
  searchQuery: '',
  issues: [],
  issuesLoading: false,
  issuesError: null,
  selectedIssueId: null,
  workflowStatesByTeam: {},
  users: [],
  viewer: null,
  linkedWorktrees: [],
};

/** Debounce window for the search box before it refetches. */
const SEARCH_DEBOUNCE_MS = 300;

/////////////
// Helpers //
/////////////

export const useLinear = create<LinearStoreState>(() => INITIAL);

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

/////////////
// Actions //
/////////////

/** Fetch the linked user's assigned issues (New-Worktree modal combobox). */
export async function refreshAssignedIssues(): Promise<void> {
  useLinear.setState({ assignedLoading: true, assignedError: null });
  try {
    const assignedIssues = await trpc().linear.myIssues.query();
    useLinear.setState({ assignedIssues, assignedLoading: false, assignedLoaded: true });
  } catch (err) {
    useLinear.setState({ assignedLoading: false, assignedLoaded: true, assignedError: message(err) });
  }
}

/** Load the linked account's teams into the store (the browser's filter). */
export async function refreshTeams(): Promise<void> {
  try {
    const teams = await trpc().linear.teams.query();
    useLinear.setState({ teams });
  } catch {
    // Non-fatal — the filter simply shows "All teams".
  }
}

/** Fetch browser issues for the current team + search filter. */
export async function refreshIssues(): Promise<void> {
  const { selectedTeamId, searchQuery } = useLinear.getState();
  useLinear.setState({ issuesLoading: true, issuesError: null });
  try {
    const issues = await trpc().linear.issues.query({
      teamId: selectedTeamId ?? undefined,
      query: searchQuery.trim() || undefined,
    });
    useLinear.setState({ issues, issuesLoading: false });
  } catch (err) {
    useLinear.setState({ issuesLoading: false, issuesError: message(err) });
  }
}

/** Set the team filter (null = all) and refetch. */
export function setSelectedTeam(selectedTeamId: string | null): void {
  useLinear.setState({ selectedTeamId });
  void refreshIssues();
}

/** Update the search text; refetch after a short debounce. */
export function setSearchQuery(searchQuery: string): void {
  useLinear.setState({ searchQuery });
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void refreshIssues(), SEARCH_DEBOUNCE_MS);
}

/** Open an issue in the detail panel and ensure its team's workflow states are loaded. */
export function selectIssue(issueId: string | null): void {
  useLinear.setState({ selectedIssueId: issueId });
  if (!issueId) return;
  const issue = useLinear.getState().issues.find((i) => i.id === issueId);
  if (issue?.teamId) void ensureWorkflowStates(issue.teamId);
}

/** Load (once, then cache) a team's workflow states for the status dropdown. */
export async function ensureWorkflowStates(teamId: string): Promise<void> {
  if (useLinear.getState().workflowStatesByTeam[teamId]) return;
  try {
    const states = await trpc().linear.workflowStates.query({ teamId });
    useLinear.setState((s) => ({
      workflowStatesByTeam: { ...s.workflowStatesByTeam, [teamId]: states },
    }));
  } catch {
    // Non-fatal — the status dropdown simply stays empty.
  }
}

/** Load the assignee-picker options (active org users) once. */
export async function refreshUsers(): Promise<void> {
  if (useLinear.getState().users.length > 0) return;
  try {
    const users = await trpc().linear.users.query();
    useLinear.setState({ users });
  } catch {
    // Non-fatal.
  }
}

/** Load the linked account's own user once (for "Assign to me"). */
export async function ensureViewer(): Promise<void> {
  if (useLinear.getState().viewer) return;
  try {
    const viewer = await trpc().linear.viewer.query();
    useLinear.setState({ viewer });
  } catch {
    // Non-fatal — "Assign to me" is hidden without a viewer.
  }
}

/** Refresh the issue→worktree join used to show linked worktrees per issue. */
export async function refreshLinkedWorktrees(): Promise<void> {
  try {
    const linkedWorktrees = await trpc().linear.linkedWorktrees.query();
    useLinear.setState({ linkedWorktrees });
  } catch {
    // Non-fatal.
  }
}

/** Patch a freshly-updated issue into the browser list in place. */
function patchIssue(issue: LinearIssue): void {
  useLinear.setState((s) => ({
    issues: s.issues.map((i) => (i.id === issue.id ? issue : i)),
  }));
}

/** Move an issue to a workflow state; patch it in place on success. */
export async function setIssueState(issueId: string, stateId: string): Promise<void> {
  try {
    patchIssue(await trpc().linear.setIssueState.mutate({ issueId, stateId }));
  } catch (err) {
    useLinear.setState({ issuesError: message(err) });
  }
}

/** (Re)assign an issue (`assigneeId: null` unassigns); patch it in place on success. */
export async function setIssueAssignee(issueId: string, assigneeId: string | null): Promise<void> {
  try {
    patchIssue(await trpc().linear.setIssueAssignee.mutate({ issueId, assigneeId }));
  } catch (err) {
    useLinear.setState({ issuesError: message(err) });
  }
}

////////////
// Sync   //
////////////

/**
 * Keep the Linear browser in sync while a worktree is open: load teams, issues,
 * linked worktrees, users, and the viewer once Linear is connected, and re-fetch
 * issues + linked worktrees on window focus (tickets change constantly). No-op on
 * the default (non-worktree) workspace or while Linear is disconnected. Mirrors
 * `useGitSync`; mounted by the Linear view.
 */
export function useLinearSync(): void {
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const linearConnected = useOnboarding((s) => s.linearConnected);

  useEffect(() => {
    if (workspaceId === DEFAULT_WORKSPACE_ID || !linearConnected) return;
    void refreshTeams();
    void refreshIssues();
    void refreshLinkedWorktrees();
    void refreshUsers();
    void ensureViewer();
  }, [workspaceId, linearConnected]);

  useEffect(() => {
    if (workspaceId === DEFAULT_WORKSPACE_ID || !linearConnected) return;
    const onFocus = () => {
      void refreshIssues();
      void refreshLinkedWorktrees();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [workspaceId, linearConnected]);
}
