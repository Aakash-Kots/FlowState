/**
 * Persistence for the Project domain — the GitHub repositories a user has
 * cloned into FlowState. Rows are validated against the shared `projectSchema`
 * on the way out, so the database can never hand back a malformed Project to the
 * rest of the app.
 */
import {
  TerminalKind,
  type Project,
  type ProjectScriptKind,
  projectSchema,
} from '@flowstate/shared';
import { desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { projects } from './schema';

type ProjectRow = typeof projects.$inferSelect;

function rowToProject(row: ProjectRow): Project {
  return projectSchema.parse({
    id: row.id,
    name: row.name,
    owner: row.owner,
    fullName: row.fullName,
    cloneUrl: row.cloneUrl,
    localPath: row.localPath,
    defaultBranch: row.defaultBranch,
    worktreeBaseBranch: row.worktreeBaseBranch,
    private: row.private,
    setupScript: row.setupScript,
    setupScriptEnabled: row.setupScriptEnabled,
    runScript: row.runScript,
    runScriptEnabled: row.runScriptEnabled,
    createdAt: row.createdAt,
  });
}

function projectToRow(project: Project): ProjectRow {
  return {
    id: project.id,
    name: project.name,
    owner: project.owner,
    fullName: project.fullName,
    cloneUrl: project.cloneUrl,
    localPath: project.localPath,
    defaultBranch: project.defaultBranch,
    worktreeBaseBranch: project.worktreeBaseBranch,
    private: project.private,
    setupScript: project.setupScript,
    setupScriptEnabled: project.setupScriptEnabled,
    runScript: project.runScript,
    runScriptEnabled: project.runScriptEnabled,
    createdAt: project.createdAt,
  };
}

/** All projects, most-recently-added first. */
export function listProjects(): Project[] {
  return getDb().select().from(projects).orderBy(desc(projects.createdAt)).all().map(rowToProject);
}

export function getProject(id: string): Project | null {
  const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
  return row ? rowToProject(row) : null;
}

/** Insert or update a project, keyed by id. Returns the validated record. */
export function upsertProject(input: Project): Project {
  const project = projectSchema.parse(input);
  const row = projectToRow(project);
  getDb()
    .insert(projects)
    .values(row)
    .onConflictDoUpdate({
      target: projects.id,
      // id and createdAt are immutable; update everything else.
      set: {
        name: row.name,
        owner: row.owner,
        fullName: row.fullName,
        cloneUrl: row.cloneUrl,
        localPath: row.localPath,
        defaultBranch: row.defaultBranch,
        worktreeBaseBranch: row.worktreeBaseBranch,
        private: row.private,
        setupScript: row.setupScript,
        setupScriptEnabled: row.setupScriptEnabled,
        runScript: row.runScript,
        runScriptEnabled: row.runScriptEnabled,
      },
    })
    .run();
  return project;
}

/**
 * Patch one of a project's two scripts. Omitted fields are left unchanged, so a
 * caller editing the command can never clobber a concurrent enable/disable.
 * Clearing the command also re-enables the slot, so setting a new one later
 * isn't silently disabled. Returns the updated record, or null if absent.
 */
export function setProjectScript(
  projectId: string,
  kind: ProjectScriptKind,
  patch: { command?: string | null; enabled?: boolean },
): Project | null {
  const existing = getProject(projectId);
  if (!existing) return null;

  const setup = kind === TerminalKind.Setup;
  const command =
    patch.command === undefined
      ? setup
        ? existing.setupScript
        : existing.runScript
      : patch.command;
  // A cleared command resets the flag; otherwise honour the patch, else keep.
  const enabled =
    command === null
      ? true
      : (patch.enabled ?? (setup ? existing.setupScriptEnabled : existing.runScriptEnabled));

  return upsertProject(
    setup
      ? { ...existing, setupScript: command, setupScriptEnabled: enabled }
      : { ...existing, runScript: command, runScriptEnabled: enabled },
  );
}

/**
 * Set the branch new worktrees are cut from (null falls back to `defaultBranch`).
 * Returns the updated record, or null if the project is absent.
 */
export function setProjectBaseBranch(
  projectId: string,
  worktreeBaseBranch: string | null,
): Project | null {
  const existing = getProject(projectId);
  if (!existing) return null;
  return upsertProject({ ...existing, worktreeBaseBranch });
}

export function deleteProject(id: string): void {
  getDb().delete(projects).where(eq(projects.id, id)).run();
}
