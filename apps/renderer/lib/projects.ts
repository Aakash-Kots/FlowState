'use client';

import { create } from 'zustand';
import type { GithubRepo, Project } from '@flowstate/shared';
import { trpc } from './trpc';
import { useWorkspace } from './workspace';

///////////
// Types //
///////////

type ProjectsState = {
  /** Projects the user has brought into FlowState (persisted). */
  projects: Project[];
  /** Whether the Add Project modal is open. */
  addOpen: boolean;
  /** Candidate repos from the linked GitHub account. */
  repos: GithubRepo[];
  reposLoading: boolean;
  reposError: string | null;
  /** True while a clone/add is in flight. */
  adding: boolean;
  addError: string | null;
};

/////////////
// Helpers //
/////////////

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useProjects = create<ProjectsState>(() => ({
  projects: [],
  addOpen: false,
  repos: [],
  reposLoading: false,
  reposError: null,
  adding: false,
  addError: null,
}));

/** Load the persisted project list into the store. */
export async function loadProjects(): Promise<void> {
  try {
    const projects = await trpc().projects.list.query();
    useProjects.setState({ projects });
  } catch {
    // Non-fatal: the sidebar simply shows no projects until this succeeds.
  }
}

/** Make an existing project the active working folder. */
export async function openProject(project: Project): Promise<void> {
  try {
    const opened = await trpc().projects.open.mutate({ id: project.id });
    useWorkspace.setState({ cwd: opened.localPath });
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
