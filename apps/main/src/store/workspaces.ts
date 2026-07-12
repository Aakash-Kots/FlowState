/**
 * Persistence for the Workspace domain model. Rows are validated against the
 * shared `workspaceSchema` on the way out, so the database can never hand back a
 * malformed Workspace to the rest of the app.
 */
import { type Workspace, workspaceSchema } from '@flowstate/shared';
import { desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { workspaces } from './schema';

type WorkspaceRow = typeof workspaces.$inferSelect;

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return workspaceSchema.parse({
    id: row.id,
    name: row.name,
    repoRoot: row.repoRoot,
    worktreePath: row.worktreePath,
    branch: row.branch,
    linearIssue: row.linearIssue ? JSON.parse(row.linearIssue) : null,
    claudeState: row.claudeState,
    claudeSessionId: row.claudeSessionId,
    createdAt: row.createdAt,
  });
}

function workspaceToRow(ws: Workspace): WorkspaceRow {
  return {
    id: ws.id,
    name: ws.name,
    repoRoot: ws.repoRoot,
    worktreePath: ws.worktreePath,
    branch: ws.branch,
    linearIssue: ws.linearIssue ? JSON.stringify(ws.linearIssue) : null,
    claudeState: ws.claudeState,
    claudeSessionId: ws.claudeSessionId,
    createdAt: ws.createdAt,
  };
}

export function listWorkspaces(): Workspace[] {
  return getDb()
    .select()
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt))
    .all()
    .map(rowToWorkspace);
}

export function getWorkspace(id: string): Workspace | null {
  const row = getDb().select().from(workspaces).where(eq(workspaces.id, id)).get();
  return row ? rowToWorkspace(row) : null;
}

/** Insert or update a workspace, keyed by id. Returns the validated record. */
export function upsertWorkspace(input: Workspace): Workspace {
  const ws = workspaceSchema.parse(input);
  const row = workspaceToRow(ws);
  getDb()
    .insert(workspaces)
    .values(row)
    .onConflictDoUpdate({
      target: workspaces.id,
      // id and createdAt are immutable; update everything else.
      set: {
        name: row.name,
        repoRoot: row.repoRoot,
        worktreePath: row.worktreePath,
        branch: row.branch,
        linearIssue: row.linearIssue,
        claudeState: row.claudeState,
        claudeSessionId: row.claudeSessionId,
      },
    })
    .run();
  return ws;
}

export function deleteWorkspace(id: string): void {
  getDb().delete(workspaces).where(eq(workspaces.id, id)).run();
}
