'use client';

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { DEFAULT_WORKSPACE_ID, GitFileStatus, PrState } from '@flowstate/shared';
import type { GitChange, GitDiffStat, GitFileDiff, GitStatus, PrStatus } from '@flowstate/shared';
import { trpc } from './trpc';
import { useWorkspace } from './workspace';

///////////
// Types //
///////////

/** Which file the diff panel is showing, and from which side. */
type Selection = { path: string; staged: boolean };

type GitStoreState = {
  /** The workspace the current state belongs to (guards stale async writes). */
  workspaceId: string | null;
  loading: boolean;
  status: GitStatus | null;
  /** The PR opened for this worktree's branch (CI/merge signal), or null if none. */
  pr: PrStatus | null;
  error: string | null;
  selected: Selection | null;
  diff: GitFileDiff | null;
  diffLoading: boolean;
  /** Commit message fields. */
  summary: string;
  description: string;
  /** True while a commit/push/pull/fetch/PR is in flight. */
  busy: boolean;
  actionError: string | null;
};

/////////////
// Helpers //
/////////////

const INITIAL: GitStoreState = {
  workspaceId: null,
  loading: false,
  status: null,
  pr: null,
  error: null,
  selected: null,
  diff: null,
  diffLoading: false,
  summary: '',
  description: '',
  busy: false,
  actionError: null,
};

export const useGit = create<GitStoreState>(() => INITIAL);

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The active worktree's workspace id, or null on the default (non-worktree) workspace. */
function activeWorkspaceId(): string {
  return useWorkspace.getState().workspaceId;
}

/** True when a change for `path`/`staged` is still present in the latest status. */
function stillPresent(status: GitStatus, sel: Selection): boolean {
  const list = sel.staged ? status.staged : status.unstaged;
  return list.some((c) => c.path === sel.path);
}

/** A drafted commit summary for a single change, e.g. `Update Button.tsx`. */
export function autoCommitSummary(change: GitChange): string {
  const name = change.path.split('/').pop() || change.path;
  const verb =
    change.status === GitFileStatus.Added || change.status === GitFileStatus.Untracked
      ? 'Add'
      : change.status === GitFileStatus.Deleted
        ? 'Delete'
        : change.status === GitFileStatus.Renamed
          ? 'Rename'
          : 'Update';
  return `${verb} ${name}`;
}

//////////////
// Actions  //
//////////////

/** Reset to a clean slate when switching worktrees. */
export function resetGit(workspaceId: string): void {
  useGit.setState({ ...INITIAL, workspaceId });
}

/** (Re)load the active worktree's status, preserving a still-valid selection. */
export async function refreshStatus(): Promise<void> {
  const workspaceId = activeWorkspaceId();
  useGit.setState({ loading: true, error: null });
  try {
    const status = await trpc().git.status.query({ workspaceId });
    // Ignore a response that arrived after the user switched worktrees.
    if (activeWorkspaceId() !== workspaceId) return;

    const state = useGit.getState();
    const keep = state.selected && stillPresent(status, state.selected) ? state.selected : null;
    useGit.setState({
      loading: false,
      status,
      selected: keep,
      diff: keep ? state.diff : null,
    });
  } catch (err) {
    if (activeWorkspaceId() !== workspaceId) return;
    useGit.setState({ loading: false, error: message(err), status: null });
  }
}

/**
 * (Re)load the active worktree's PR status (CI + merge signal) from GitHub. A
 * best-effort network read: failures just clear the PR. No-op on the default
 * (non-worktree) workspace.
 */
export async function refreshPr(): Promise<void> {
  const workspaceId = activeWorkspaceId();
  if (workspaceId === DEFAULT_WORKSPACE_ID) return;
  try {
    const pr = await trpc().git.prStatus.query({ workspaceId });
    if (activeWorkspaceId() !== workspaceId) return;
    useGit.setState({ pr });
  } catch {
    if (activeWorkspaceId() !== workspaceId) return;
    useGit.setState({ pr: null });
  }
}

/** Select a file and load its diff into the panel. */
export async function selectFile(path: string, staged: boolean): Promise<void> {
  const workspaceId = activeWorkspaceId();
  useGit.setState({ selected: { path, staged }, diff: null, diffLoading: true });
  try {
    const diff = await trpc().git.diffFile.query({ workspaceId, path, staged });
    const sel = useGit.getState().selected;
    if (sel?.path === path && sel.staged === staged) {
      useGit.setState({ diff, diffLoading: false });
    }
  } catch {
    useGit.setState({ diffLoading: false });
  }
}

export function setSummary(summary: string): void {
  useGit.setState({ summary });
}

export function setDescription(description: string): void {
  useGit.setState({ description });
}

/** Run a git mutation then refresh status; surfaces failures via `actionError`. */
async function withRefresh(fn: (workspaceId: string) => Promise<unknown>): Promise<boolean> {
  const workspaceId = activeWorkspaceId();
  useGit.setState({ busy: true, actionError: null });
  try {
    await fn(workspaceId);
    await refreshStatus();
    void refreshPr();
    useGit.setState({ busy: false });
    return true;
  } catch (err) {
    useGit.setState({ busy: false, actionError: message(err) });
    return false;
  }
}

/** Discard a file's changes (revert tracked, delete untracked). */
export function discard(paths: string[]): Promise<boolean> {
  return withRefresh((workspaceId) => trpc().git.discard.mutate({ workspaceId, paths }));
}

export function fetchRemote(): Promise<boolean> {
  return withRefresh((workspaceId) => trpc().git.fetch.mutate({ workspaceId }));
}

export function pull(): Promise<boolean> {
  return withRefresh((workspaceId) => trpc().git.pull.mutate({ workspaceId }));
}

export function push(): Promise<boolean> {
  return withRefresh((workspaceId) => trpc().git.push.mutate({ workspaceId }));
}

/** Merge the worktree's open PR into its base branch. */
export function mergePr(): Promise<boolean> {
  return withRefresh((workspaceId) => trpc().git.mergePr.mutate({ workspaceId }));
}

/** Commit the staged changes; clears the message on success. */
export async function commit(): Promise<boolean> {
  const { summary, description } = useGit.getState();
  if (!summary.trim()) return false;
  const ok = await withRefresh((workspaceId) =>
    trpc().git.commit.mutate({
      workspaceId,
      summary: summary.trim(),
      description: description.trim() || undefined,
    }),
  );
  if (ok) useGit.setState({ summary: '', description: '' });
  return ok;
}

/** Commit then push the branch. */
export async function commitAndPush(): Promise<boolean> {
  const committed = await commit();
  if (!committed) return false;
  return push();
}

/** Set the commit message, then commit and push — used by the header quick actions. */
export function commitAndPushWith(summary: string, description?: string): Promise<boolean> {
  useGit.setState({ summary, description: description ?? '' });
  return commitAndPush();
}

/** Commit, push, and open a PR — opening the PR URL in the browser on success. */
export async function commitAndCreatePr(): Promise<void> {
  const { summary, description } = useGit.getState();
  const title = summary.trim();
  const body = description.trim() || undefined;
  const committed = await commit();
  if (!committed) return;

  const workspaceId = activeWorkspaceId();
  useGit.setState({ busy: true, actionError: null });
  try {
    const pr = await trpc().git.createPr.mutate({ workspaceId, title: title || 'Changes', body });
    await trpc()
      .app.openExternal.mutate({ url: pr.url })
      .catch(() => {});
    useGit.setState({ busy: false });
    await refreshStatus();
    void refreshPr();
  } catch (err) {
    useGit.setState({ busy: false, actionError: message(err) });
  }
}

/**
 * Open a PR for an already-committed branch (the clean-tree case) — the git
 * router pushes the branch first, then opens the PR against its base. Opens the
 * PR URL in the browser on success.
 */
export async function createPr(title: string, body?: string): Promise<void> {
  const workspaceId = activeWorkspaceId();
  useGit.setState({ busy: true, actionError: null });
  try {
    const pr = await trpc().git.createPr.mutate({ workspaceId, title, body });
    await trpc()
      .app.openExternal.mutate({ url: pr.url })
      .catch(() => {});
    useGit.setState({ busy: false });
    await refreshStatus();
    void refreshPr();
  } catch (err) {
    useGit.setState({ busy: false, actionError: message(err) });
  }
}

///////////////
// Constants //
///////////////

/** How often to re-poll the PR's CI/merge status while a worktree is active. */
const PR_POLL_MS = 20_000;

///////////
// Hooks //
///////////

/**
 * A worktree's aggregate line-change counts (branch vs base), for the sidebar
 * badge. Self-contained per row: loads on mount/worktree change and refreshes on
 * window focus (git state can change from a terminal or the Claude session).
 */
export function useWorktreeDiffStat(workspaceId: string): GitDiffStat | null {
  const [stat, setStat] = useState<GitDiffStat | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await trpc().git.diffStat.query({ workspaceId });
        if (!cancelled) setStat(next);
      } catch {
        if (!cancelled) setStat(null);
      }
    };
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [workspaceId]);

  return stat;
}

/**
 * Whether this worktree's branch has a merged PR — gates the sidebar's Archive
 * control. Self-contained per row (mirrors `useWorktreeDiffStat`): a best-effort
 * `git.prStatus` read on mount/worktree-change and on window focus. One GitHub
 * call per row; failures/no-PR read as not-merged.
 */
export function useWorktreePrMerged(workspaceId: string): boolean {
  const [merged, setMerged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const pr = await trpc().git.prStatus.query({ workspaceId });
        if (!cancelled) setMerged(pr?.state === PrState.Merged);
      } catch {
        if (!cancelled) setMerged(false);
      }
    };
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [workspaceId]);

  return merged;
}

/**
 * Keep the git store in sync with the active worktree: reset + load status (and
 * the branch's PR status) when the worktree changes, refresh both on window
 * focus (git state can change from a terminal or the Claude session), and poll
 * the PR status so CI progress shows without a manual refresh. Mounted once by
 * the always-present header button so status is ready even when the Git view
 * isn't open. No-op on the default (non-worktree) workspace.
 */
export function useGitSync(): void {
  const workspaceId = useWorkspace((s) => s.workspaceId);

  useEffect(() => {
    if (workspaceId === DEFAULT_WORKSPACE_ID) return;
    resetGit(workspaceId);
    void refreshStatus();
    void refreshPr();
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId === DEFAULT_WORKSPACE_ID) return;
    const onFocus = () => {
      void refreshStatus();
      void refreshPr();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId === DEFAULT_WORKSPACE_ID) return;
    const id = setInterval(() => void refreshPr(), PR_POLL_MS);
    return () => clearInterval(id);
  }, [workspaceId]);
}
