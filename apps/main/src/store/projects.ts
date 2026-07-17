/**
 * Persistence for the Project domain — the GitHub repositories a user has
 * cloned into FlowState. Rows are validated against the shared `projectSchema`
 * on the way out, so the database can never hand back a malformed Project to the
 * rest of the app.
 */
import { type Project, projectSchema } from '@flowstate/shared';
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
    runScript: row.runScript,
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
    runScript: project.runScript,
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
        runScript: row.runScript,
      },
    })
    .run();
  return project;
}

/** Set a project's Setup/Run scripts. Returns the updated record, or null if absent. */
export function setProjectScripts(
  projectId: string,
  scripts: { setupScript: string | null; runScript: string | null },
): Project | null {
  const existing = getProject(projectId);
  if (!existing) return null;
  return upsertProject({ ...existing, ...scripts });
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
