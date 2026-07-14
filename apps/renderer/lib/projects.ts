'use client';

import { create } from 'zustand';
import {
  DEFAULT_WORKSPACE_ID,
  type GithubRepo,
  type Project,
  type Workspace,
} from '@flowstate/shared';
import { refreshTerminals } from './terminals';
import { trpc } from './trpc';
import { selectWorkspace, useWorkspace } from './workspace';

///////////
// Types //
///////////

type ProjectsState = {
  /** Projects the user has brought into FlowState (persisted). */
  projects: Project[];
  /** Worktree-workspaces (sub-tabs) per project id. */
  worktrees: Record<string, Workspace[]>;
  /** Whether the Add Project modal is open. */
  addOpen: boolean;
  /** Candidate repos from the linked GitHub account. */
  repos: GithubRepo[];
  reposLoading: boolean;
  reposError: string | null;
  /** True while a clone/add is in flight. */
  adding: boolean;
  addError: string | null;
  /** Create-worktree modal state (which project, in-flight, last error). */
  createOpen: boolean;
  createProjectId: string | null;
  creating: boolean;
  createError: string | null;
  /** The active project's local branches — base-ref choices in the modal. */
  branches: string[];
  branchesLoading: boolean;
};

/////////////
// Helpers //
/////////////

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useProjects = create<ProjectsState>(() => ({
  projects: [],
  worktrees: {},
  addOpen: false,
  repos: [],
  reposLoading: false,
  reposError: null,
  adding: false,
  addError: null,
  createOpen: false,
  createProjectId: null,
  creating: false,
  createError: null,
  branches: [],
  branchesLoading: false,
}));

/** Load the persisted project list — and each project's worktrees — into the store. */
export async function loadProjects(): Promise<void> {
  try {
    const projects = await trpc().projects.list.query();
    useProjects.setState({ projects });
    await Promise.all(projects.map((p) => loadWorktrees(p.id)));
  } catch {
    // Non-fatal: the sidebar simply shows no projects until this succeeds.
  }
}

/** Load a project's worktree-workspaces into the store. */
export async function loadWorktrees(projectId: string): Promise<void> {
  try {
    const list = await trpc().worktree.list.query({ projectId });
    useProjects.setState((s) => ({ worktrees: { ...s.worktrees, [projectId]: list } }));
  } catch {
    // Non-fatal.
  }
}

/** Make an existing project's clone the active working folder (the default workspace). */
export async function openProject(project: Project): Promise<void> {
  try {
    await trpc().projects.open.mutate({ id: project.id });
    if (useWorkspace.getState().workspaceId === DEFAULT_WORKSPACE_ID) {
      useWorkspace.setState({ cwd: project.localPath });
    } else {
      await selectWorkspace(DEFAULT_WORKSPACE_ID);
    }
  } catch {
    // Ignore — the active project simply stays unchanged.
  }
}

/**
 * Bring in a folder from the local filesystem (native picker), make it active,
 * and close the modal. A cancelled picker is a no-op.
 */
export async function addLocalProject(): Promise<void> {
  useProjects.setState({ adding: true, addError: null });
  try {
    const project = await trpc().projects.addLocal.mutate();
    if (!project) {
      useProjects.setState({ adding: false });
      return;
    }
    useWorkspace.setState({ cwd: project.localPath });
    useProjects.setState((s) => ({
      adding: false,
      addOpen: false,
      projects: [project, ...s.projects.filter((p) => p.id !== project.id)],
    }));
  } catch (err) {
    useProjects.setState({ adding: false, addError: message(err) });
  }
}

/** Open or close the Add Project modal (resetting transient errors on open). */
export function setAddOpen(open: boolean): void {
  useProjects.setState(open ? { addOpen: true, addError: null } : { addOpen: false });
}

/** Fetch the linked account's repositories into the store. */
export async function loadRepos(): Promise<void> {
  useProjects.setState({ reposLoading: true, reposError: null });
  try {
    const repos = await trpc().projects.listRepos.query();
    useProjects.setState({ repos, reposLoading: false });
  } catch (err) {
    useProjects.setState({ reposLoading: false, reposError: message(err) });
  }
}

/**
 * Clone + persist a repo, make it the active working folder, and close the
 * modal. Surfaces failures via `addError` rather than throwing.
 */
export async function addProject(repo: GithubRepo): Promise<void> {
  useProjects.setState({ adding: true, addError: null });
  try {
    const project = await trpc().projects.add.mutate({
      fullName: repo.fullName,
      cloneUrl: repo.cloneUrl,
      defaultBranch: repo.defaultBranch,
      private: repo.private,
    });
    useWorkspace.setState({ cwd: project.localPath });
    useProjects.setState((s) => ({
      adding: false,
      addOpen: false,
      projects: [project, ...s.projects.filter((p) => p.id !== project.id)],
    }));
  } catch (err) {
    useProjects.setState({ adding: false, addError: message(err) });
  }
}

////////////////
// Worktrees  //
////////////////

/** Open the create-worktree modal for a project (resetting the last error). */
export function openCreateWorktree(projectId: string): void {
  useProjects.setState({
    createOpen: true,
    createProjectId: projectId,
    createError: null,
    branches: [],
  });
  void loadBranches(projectId);
}

/** Load a project's local branches (the base-ref choices) into the store. */
export async function loadBranches(projectId: string): Promise<void> {
  useProjects.setState({ branchesLoading: true });
  try {
    const branches = await trpc().worktree.listBranches.query({ projectId });
    useProjects.setState({ branches, branchesLoading: false });
  } catch {
    useProjects.setState({ branchesLoading: false });
  }
}

/** Open or close the create-worktree modal. */
export function setCreateOpen(open: boolean): void {
  useProjects.setState(open ? { createOpen: true, createError: null } : { createOpen: false });
}

/**
 * Create a worktree (branch + linked env + first tab) under the modal's project,
 * insert it into the tree, and switch to it. Surfaces failures via `createError`.
 */
export async function createWorktree(input: {
  baseRef?: string;
  initialPrompt?: string;
}): Promise<void> {
  const projectId = useProjects.getState().createProjectId;
  if (!projectId) return;
  useProjects.setState({ creating: true, createError: null });
  try {
    const { workspace } = await trpc().worktree.create.mutate({
      projectId,
      baseRef: input.baseRef?.trim() || undefined,
      initialPrompt: input.initialPrompt?.trim() || undefined,
    });
    useProjects.setState((s) => ({
      creating: false,
      createOpen: false,
      worktrees: { ...s.worktrees, [projectId]: [workspace, ...(s.worktrees[projectId] ?? [])] },
    }));
    await selectWorkspace(workspace.id);
  } catch (err) {
    useProjects.setState({ creating: false, createError: message(err) });
  }
}

/** Switch the active workspace to a worktree. */
export function selectWorktree(workspace: Workspace): void {
  void selectWorkspace(workspace.id);
}

/**
 * Save a project's Setup/Run scripts (shared by all its worktrees) and refresh
 * the active worktree's terminals so the Setup/Run tabs pick up the new command.
 */
export async function saveProjectScripts(
  projectId: string,
  scripts: { setupScript: string | null; runScript: string | null },
): Promise<void> {
  const project = await trpc().projects.setScripts.mutate({ projectId, ...scripts });
  useProjects.setState((s) => ({
    projects: s.projects.map((p) => (p.id === projectId ? project : p)),
  }));
  await refreshTerminals();
}

/**
 * Remove a worktree (guards uncommitted changes unless the user forces it). If
 * it was the active workspace, fall back to the project's clone.
 */
export async function removeWorktree(workspace: Workspace): Promise<void> {
  const projectId = workspace.projectId ?? '';
  const wasActive = useWorkspace.getState().workspaceId === workspace.id;
  try {
    await trpc().worktree.remove.mutate({ workspaceId: workspace.id });
  } catch (err) {
    const dirty = message(err).toLowerCase().includes('uncommitted');
    if (!dirty || !window.confirm(`${message(err)}\n\nRemove it anyway and discard the changes?`)) {
      return;
    }
    try {
      await trpc().worktree.remove.mutate({ workspaceId: workspace.id, force: true });
    } catch (forceErr) {
      window.alert(message(forceErr));
      return;
    }
  }
  useProjects.setState((s) => ({
    worktrees: {
      ...s.worktrees,
      [projectId]: (s.worktrees[projectId] ?? []).filter((w) => w.id !== workspace.id),
    },
  }));
  if (wasActive) await selectWorkspace(DEFAULT_WORKSPACE_ID);
}

/**
 * Archive a merged worktree: drop it from the sidebar immediately (the main
 * process hides it and the background reaper deletes it from disk after the
 * configured delay). If it was active, fall back to the project's clone.
 */
export async function archiveWorktree(workspace: Workspace): Promise<void> {
  const projectId = workspace.projectId ?? '';
  const wasActive = useWorkspace.getState().workspaceId === workspace.id;
  try {
    await trpc().worktree.archive.mutate({ workspaceId: workspace.id });
  } catch (err) {
    window.alert(message(err));
    return;
  }
  useProjects.setState((s) => ({
    worktrees: {
      ...s.worktrees,
      [projectId]: (s.worktrees[projectId] ?? []).filter((w) => w.id !== workspace.id),
    },
  }));
  if (wasActive) await selectWorkspace(DEFAULT_WORKSPACE_ID);
}
