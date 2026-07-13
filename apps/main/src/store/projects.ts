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
    private: row.private,
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
    private: project.private,
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
        private: row.private,
      },
    })
    .run();
  return project;
}

export function deleteProject(id: string): void {
  getDb().delete(projects).where(eq(projects.id, id)).run();
}
