'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import {
  DEFAULT_WORKSPACE_ID,
  LinearPrStatus,
  LinearStateType,
  type CreateLinearIssueInput,
  type LinearIssue,
  type LinearIssueRef,
  type LinearLabel,
  type LinearProject,
  type LinearTeam,
  type LinearUser,
  type LinearWorkflowState,
  type LinkedWorktree,
} from '@flowstate/shared';
import { WorkspaceView } from './enums/view';
import { useOnboarding } from './onboarding';
import { fuzzyScore } from './search';
import { trpc } from './trpc';
import { setViewMode, useWorkspace } from './workspace';

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

  //// Issue browser — the Linear tab's "All issues" list. ////
  teams: LinearTeam[];
  /** Active team filter; null means "all teams". */
  selectedTeamId: string | null;
  searchQuery: string;
  /** Command-center filters, threaded into the issues query. */
  filterAssigneeId: string | null;
  filterStateIds: string[];
  filterPriorities: number[];
  includeCompleted: boolean;
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
  /** Projects + labels — the create-ticket pickers (and future filters). */
  projects: LinearProject[];
  labels: LinearLabel[];
  /** Local worktrees linked to an issue (grouped by issueId in the UI). */
  linkedWorktrees: LinkedWorktree[];
  /** Full issue details fetched on demand (the ticket hover card), cached by id. */
  issueDetailsById: Record<string, LinearIssue>;
  /** A parent issue's sub-issues, fetched on demand for the detail panel, cached by parent id. */
  subIssuesByParentId: Record<string, LinearIssue[]>;

  //// Command-center top sections — assigned-scoped issues (Active Work / Open PRs). ////
  myWorkIssues: LinearIssue[];

  //// Create-ticket modal. ////
  createTicketOpen: boolean;
  creating: boolean;
  createError: string | null;
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
  filterAssigneeId: null,
  filterStateIds: [],
  filterPriorities: [],
  includeCompleted: false,
  issues: [],
  issuesLoading: false,
  issuesError: null,
  selectedIssueId: null,
  workflowStatesByTeam: {},
  users: [],
  viewer: null,
  projects: [],
  labels: [],
  linkedWorktrees: [],
  issueDetailsById: {},
  subIssuesByParentId: {},
  myWorkIssues: [],
  createTicketOpen: false,
  creating: false,
  createError: null,
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

/** Monotonic token so a slow issues fetch can't clobber a newer one's results. */
let issuesReq = 0;

/** Down-convert a browser issue to the small ref a linked worktree persists. */
export function issueToRef(issue: LinearIssue): LinearIssueRef {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    branchName: issue.branchName,
    stateName: issue.state.name,
  };
}

/** Group linked worktrees by the issue they're attached to. */
export function worktreesByIssue(linked: LinkedWorktree[]): Map<string, LinkedWorktree[]> {
  const map = new Map<string, LinkedWorktree[]>();
  for (const w of linked) {
    const arr = map.get(w.issueId);
    if (arr) arr.push(w);
    else map.set(w.issueId, [w]);
  }
  return map;
}

/**
 * Relevance bucket for search ordering (lower sorts first). Surfaces the tickets
 * you're most likely reaching for — open-PR, in-progress, then not-started —
 * above finished work (a merged/closed PR or a completed/canceled issue).
 */
export function issueRank(issue: LinearIssue): number {
  const pr = issue.pr;
  if (pr && (pr.status === LinearPrStatus.Open || pr.status === LinearPrStatus.Draft)) return 0;
  if (pr && (pr.status === LinearPrStatus.Merged || pr.status === LinearPrStatus.Closed)) return 3;
  switch (issue.state.type) {
    case LinearStateType.Started:
      return 1;
    case LinearStateType.Unstarted:
    case LinearStateType.Backlog:
    case LinearStateType.Triage:
      return 2;
    case LinearStateType.Completed:
    case LinearStateType.Canceled:
      return 3;
    default:
      return 2;
  }
}

/**
 * Stable-sort issues by relevance bucket (`issueRank`), preserving the incoming
 * order (updatedAt-desc) within a bucket. Pure — returns a new array.
 */
export function rankIssues(issues: LinearIssue[]): LinearIssue[] {
  return issues
    .map((issue, i) => ({ issue, i, rank: issueRank(issue) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.issue);
}

/** Client-side text filter over an already-loaded issue list (identifier + title). */
export function filterIssues(issues: LinearIssue[], query: string): LinearIssue[] {
  const q = query.trim();
  if (!q) return issues;
  return issues.filter((i) => fuzzyScore(`${i.identifier} ${i.title}`, q) >= 0);
}

/** Merge fresh server issues into a pool (server copy wins), keeping pool order. */
function mergeIssues(prev: LinearIssue[], incoming: LinearIssue[]): LinearIssue[] {
  const byId = new Map(prev.map((i) => [i.id, i]));
  for (const issue of incoming) byId.set(issue.id, issue);
  return [...byId.values()];
}

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

/**
 * Fetch browser issues for the current team, search text, and filters. `merge`
 * folds the results into the existing pool (server copy wins) instead of
 * replacing it — used by the debounced search so the locally-filtered list only
 * grows as the server widens it; filter changes replace. A monotonic token drops
 * stale responses so out-of-order fetches can't clobber newer state.
 */
export async function refreshIssues(merge = false): Promise<void> {
  const { selectedTeamId, searchQuery, filterAssigneeId, filterStateIds, filterPriorities, includeCompleted } =
    useLinear.getState();
  const token = ++issuesReq;
  useLinear.setState({ issuesLoading: true, issuesError: null });
  try {
    const results = await trpc().linear.issues.query({
      teamId: selectedTeamId ?? undefined,
      query: searchQuery.trim() || undefined,
      assigneeId: filterAssigneeId ?? undefined,
      stateIds: filterStateIds.length ? filterStateIds : undefined,
      priorities: filterPriorities.length ? filterPriorities : undefined,
      includeCompleted: includeCompleted || undefined,
    });
    if (token !== issuesReq) return; // a newer refresh superseded this one
    useLinear.setState((s) => ({
      issues: merge ? mergeIssues(s.issues, results) : results,
      issuesLoading: false,
    }));
  } catch (err) {
    if (token !== issuesReq) return;
    useLinear.setState({ issuesLoading: false, issuesError: message(err) });
  }
}

/**
 * Fetch the linked user's assigned issues as full `LinearIssue`s (with PR + state)
 * for the Active Work / Open PRs sections. Includes completed so a merged-but-
 * assigned ticket still surfaces.
 */
export async function refreshMyWork(): Promise<void> {
  await ensureViewer();
  const viewer = useLinear.getState().viewer;
  if (!viewer) return;
  try {
    const myWorkIssues = await trpc().linear.issues.query({
      assigneeId: viewer.id,
      includeCompleted: true,
    });
    useLinear.setState({ myWorkIssues });
  } catch {
    // Non-fatal — the top sections simply stay as they were.
  }
}

/** Set the team filter (null = all) and refetch. */
export function setSelectedTeam(selectedTeamId: string | null): void {
  useLinear.setState({ selectedTeamId });
  void refreshIssues();
}

/**
 * Update the search text. The list filters the already-loaded issues locally for
 * instant feedback (see `IssueList`); after a short debounce we merge in server
 * matches to widen the pool beyond what's loaded.
 */
export function setSearchQuery(searchQuery: string): void {
  useLinear.setState({ searchQuery });
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void refreshIssues(true), SEARCH_DEBOUNCE_MS);
}

/** Filter the browser list by assignee (null = anyone) and refetch. */
export function setFilterAssignee(filterAssigneeId: string | null): void {
  useLinear.setState({ filterAssigneeId });
  void refreshIssues();
}

/** Filter the browser list by a set of workflow-state ids and refetch. */
export function setFilterStateIds(filterStateIds: string[]): void {
  useLinear.setState({ filterStateIds });
  void refreshIssues();
}

/** Filter the browser list by a set of priorities and refetch. */
export function setFilterPriorities(filterPriorities: number[]): void {
  useLinear.setState({ filterPriorities });
  void refreshIssues();
}

/** Toggle whether completed/canceled issues appear, and refetch. */
export function setIncludeCompleted(includeCompleted: boolean): void {
  useLinear.setState({ includeCompleted });
  void refreshIssues();
}

/** Open an issue in the detail panel and ensure its team's workflow states are loaded. */
export function selectIssue(issueId: string | null): void {
  useLinear.setState({ selectedIssueId: issueId });
  if (!issueId) return;
  void ensureSubIssues(issueId);
  void ensureIssueDetail(issueId); // the list query omits the body — fetch it for the panel
  const issue = findIssue(issueId);
  if (issue?.teamId) void ensureWorkflowStates(issue.teamId);
}

/**
 * Open a searched issue in the Linear tab: inject it into the browser list (so
 * `IssueDetail` can resolve it — it only reads `issues`/`myWorkIssues`), select it
 * (which preloads its team's workflow states), and switch to the Linear view.
 * Used by the ⌘P search palette, where the ticket may not be in any loaded list.
 */
export function openIssueInLinearTab(issue: LinearIssue): void {
  useLinear.setState((s) =>
    s.issues.some((i) => i.id === issue.id) ? {} : { issues: [issue, ...s.issues] },
  );
  selectIssue(issue.id);
  setViewMode(WorkspaceView.Linear);
}

/** Look up an issue across the browser list and the top-sections list. */
function findIssue(issueId: string): LinearIssue | undefined {
  const { issues, myWorkIssues } = useLinear.getState();
  return issues.find((i) => i.id === issueId) ?? myWorkIssues.find((i) => i.id === issueId);
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

/** Load projects (optionally team-scoped) for the create-ticket picker. */
export async function refreshProjects(teamId?: string): Promise<void> {
  try {
    const projects = await trpc().linear.projects.query({ teamId });
    useLinear.setState({ projects });
  } catch {
    // Non-fatal.
  }
}

/** Load issue labels (optionally team-scoped) for the create-ticket picker. */
export async function refreshLabels(teamId?: string): Promise<void> {
  try {
    const labels = await trpc().linear.labels.query({ teamId });
    useLinear.setState({ labels });
  } catch {
    // Non-fatal.
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

/**
 * Fetch a single issue's full details on demand (the ticket hover card) and cache
 * it by id. A no-op once cached; non-fatal on error (the chip falls back to its
 * ref fields).
 */
export async function ensureIssueDetail(id: string): Promise<void> {
  if (useLinear.getState().issueDetailsById[id]) return;
  try {
    const issue = await trpc().linear.issue.query({ id });
    if (!issue) return;
    useLinear.setState((s) => ({ issueDetailsById: { ...s.issueDetailsById, [id]: issue } }));
  } catch {
    // Non-fatal — the hover card shows just the ref fields.
  }
}

/**
 * Fetch a parent issue's sub-issues on demand (the detail panel's sub-issue list)
 * and cache them by parent id. A no-op once cached; non-fatal on error (the
 * section simply stays hidden).
 */
export async function ensureSubIssues(id: string): Promise<void> {
  if (useLinear.getState().subIssuesByParentId[id]) return;
  try {
    const subIssues = await trpc().linear.subIssues.query({ id });
    useLinear.setState((s) => ({ subIssuesByParentId: { ...s.subIssuesByParentId, [id]: subIssues } }));
  } catch {
    // Non-fatal — the sub-issues section stays hidden.
  }
}

/** Patch a freshly-updated issue into both issue lists in place. */
function patchIssue(issue: LinearIssue): void {
  const replace = (list: LinearIssue[]) => list.map((i) => (i.id === issue.id ? issue : i));
  useLinear.setState((s) => ({ issues: replace(s.issues), myWorkIssues: replace(s.myWorkIssues) }));
}

/** Move an issue to a workflow state; patch in place, then reconcile top sections. */
export async function setIssueState(issueId: string, stateId: string): Promise<void> {
  try {
    patchIssue(await trpc().linear.setIssueState.mutate({ issueId, stateId }));
    void refreshMyWork();
  } catch (err) {
    useLinear.setState({ issuesError: message(err) });
  }
}

/** (Re)assign an issue (`assigneeId: null` unassigns); patch, then reconcile top sections. */
export async function setIssueAssignee(issueId: string, assigneeId: string | null): Promise<void> {
  try {
    patchIssue(await trpc().linear.setIssueAssignee.mutate({ issueId, assigneeId }));
    void refreshMyWork();
  } catch (err) {
    useLinear.setState({ issuesError: message(err) });
  }
}

/** Open or close the create-ticket modal (resetting its error on open). */
export function setCreateTicketOpen(open: boolean): void {
  useLinear.setState(open ? { createTicketOpen: true, createError: null } : { createTicketOpen: false });
}

/**
 * Create an issue; on success close the modal and refresh the lists, returning the
 * new issue so the caller can chain (e.g. create a worktree from it). Surfaces
 * failures via `createError` rather than throwing.
 */
export async function createTicket(input: CreateLinearIssueInput): Promise<LinearIssue | null> {
  useLinear.setState({ creating: true, createError: null });
  try {
    const issue = await trpc().linear.createIssue.mutate(input);
    useLinear.setState({ creating: false, createTicketOpen: false });
    void refreshIssues();
    void refreshMyWork();
    return issue;
  } catch (err) {
    useLinear.setState({ creating: false, createError: message(err) });
    return null;
  }
}

////////////
// Sync   //
////////////

/**
 * Keep the Linear command center in sync while a worktree is open: load teams,
 * issues, the assigned-work list, linked worktrees, users, viewer, projects, and
 * labels once Linear is connected, and re-fetch the issue lists on window focus
 * (tickets change constantly). No-op on the default (non-worktree) workspace or
 * while Linear is disconnected. Mirrors `useGitSync`; mounted by the Linear view.
 */
export function useLinearSync(): void {
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const linearConnected = useOnboarding((s) => s.linearConnected);

  useEffect(() => {
    if (workspaceId === DEFAULT_WORKSPACE_ID || !linearConnected) return;
    void refreshTeams();
    void refreshIssues();
    void refreshMyWork();
    void refreshLinkedWorktrees();
    void refreshUsers();
    void refreshProjects();
    void refreshLabels();
  }, [workspaceId, linearConnected]);

  useEffect(() => {
    if (workspaceId === DEFAULT_WORKSPACE_ID || !linearConnected) return;
    const onFocus = () => {
      // With an active search, merge so a background refresh doesn't reset the
      // locally-filtered pool out from under the user.
      void refreshIssues(useLinear.getState().searchQuery.trim().length > 0);
      void refreshMyWork();
      void refreshLinkedWorktrees();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [workspaceId, linearConnected]);
}
