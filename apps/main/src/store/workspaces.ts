/**
 * Persistence for the Workspace domain model. Rows are validated against the
 * shared `workspaceSchema` on the way out, so the database can never hand back a
 * malformed Workspace to the rest of the app.
 */
import { ClaudeSessionState, type Workspace, workspaceSchema } from '@flowstate/shared';
import { and, desc, eq, isNull, isNotNull } from 'drizzle-orm';
import { getDb } from './db';
import { workspaces } from './schema';

type WorkspaceRow = typeof workspaces.$inferSelect;

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return workspaceSchema.parse({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    repoRoot: row.repoRoot,
    worktreePath: row.worktreePath,
    branch: row.branch,
    baseRef: row.baseRef,
    linearIssue: row.linearIssue ? JSON.parse(row.linearIssue) : null,
    claudeState: row.claudeState,
    claudeSessionId: row.claudeSessionId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
  });
}

function workspaceToRow(ws: Workspace): WorkspaceRow {
  return {
    id: ws.id,
    projectId: ws.projectId,
    name: ws.name,
    repoRoot: ws.repoRoot,
    worktreePath: ws.worktreePath,
    branch: ws.branch,
    baseRef: ws.baseRef,
    linearIssue: ws.linearIssue ? JSON.stringify(ws.linearIssue) : null,
    claudeState: ws.claudeState,
    claudeSessionId: ws.claudeSessionId,
    archivedAt: ws.archivedAt,
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
        projectId: row.projectId,
        name: row.name,
        repoRoot: row.repoRoot,
        worktreePath: row.worktreePath,
        branch: row.branch,
        baseRef: row.baseRef,
        linearIssue: row.linearIssue,
        claudeState: row.claudeState,
        claudeSessionId: row.claudeSessionId,
        archivedAt: row.archivedAt,
      },
    })
    .run();
  return ws;
}

/**
 * A project's active (non-archived) worktrees, most-recently-created first —
 * the sidebar list. Archived rows are excluded so they vanish the moment the
 * user archives them, even though the row lingers until the reaper deletes it.
 */
export function listWorkspacesByProject(projectId: string): Workspace[] {
  return getDb()
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.projectId, projectId), isNull(workspaces.archivedAt)))
    .orderBy(desc(workspaces.createdAt))
    .all()
    .map(rowToWorkspace);
}

/** Mark a worktree archived (or clear it) — sets/unsets its `archivedAt`. */
export function archiveWorkspace(id: string, archivedAt: string | null): void {
  getDb().update(workspaces).set({ archivedAt }).where(eq(workspaces.id, id)).run();
}

/** Every archived worktree still on disk — the reaper's deletion candidates. */
export function listArchivedWorkspaces(): Workspace[] {
  return getDb()
    .select()
    .from(workspaces)
    .where(isNotNull(workspaces.archivedAt))
    .all()
    .map(rowToWorkspace);
}

export function deleteWorkspace(id: string): void {
  getDb().delete(workspaces).where(eq(workspaces.id, id)).run();
}

/**
 * Ensure a workspace row exists so child rows (tabs, transcripts) can reference
 * it. Creates a minimal placeholder — its folder fields are filled in later when
 * the user picks a working directory (`ClaudeService.setCwd`). Returns the row.
 */
export function ensureWorkspace(id: string): Workspace {
  const existing = getWorkspace(id);
  if (existing) return existing;
  return upsertWorkspace({
    id,
    projectId: null,
    name: 'Workspace',
    repoRoot: '',
    worktreePath: '',
    branch: '',
    baseRef: null,
    linearIssue: null,
    claudeState: ClaudeSessionState.Idle,
    claudeSessionId: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
  });
}
