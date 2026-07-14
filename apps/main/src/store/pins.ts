/**
 * Persistence for the pinned Skills & Actions panel — the per-worktree /
 * per-repo shortcuts a user pins beside a chat. Rows are validated against the
 * shared `pinnedItemSchema` on the way out, so the database can never hand back
 * a malformed PinnedItem. Exactly one scope column is set per row: `projectId`
 * (repo-scope) or `workspaceId` (worktree-scope).
 */
import { type PinnedItem, pinnedItemSchema } from '@flowstate/shared';
import { asc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { pinnedSkills } from './schema';

type PinnedSkillRow = typeof pinnedSkills.$inferSelect;

function rowToPinnedItem(row: PinnedSkillRow): PinnedItem {
  return pinnedItemSchema.parse({
    id: row.id,
    projectId: row.projectId,
    workspaceId: row.workspaceId,
    kind: row.kind,
    ref: row.ref,
    label: row.label,
    position: row.position,
    createdAt: row.createdAt,
  });
}

function pinnedItemToRow(item: PinnedItem): PinnedSkillRow {
  return {
    id: item.id,
    projectId: item.projectId,
    workspaceId: item.workspaceId,
    kind: item.kind,
    ref: item.ref,
    label: item.label,
    position: item.position,
    createdAt: item.createdAt,
  };
}

/** Worktree-scoped pins for a workspace, ordered by position (top-to-bottom). */
export function listPinsForWorkspace(workspaceId: string): PinnedItem[] {
  return getDb()
    .select()
    .from(pinnedSkills)
    .where(eq(pinnedSkills.workspaceId, workspaceId))
    .orderBy(asc(pinnedSkills.position))
    .all()
    .map(rowToPinnedItem);
}

/** Repo-scoped pins for a project, ordered by position (top-to-bottom). */
export function listPinsForProject(projectId: string): PinnedItem[] {
  return getDb()
    .select()
    .from(pinnedSkills)
    .where(eq(pinnedSkills.projectId, projectId))
    .orderBy(asc(pinnedSkills.position))
    .all()
    .map(rowToPinnedItem);
}

/** Insert or update a pin, keyed by id. Returns the validated record. */
export function upsertPin(input: PinnedItem): PinnedItem {
  const item = pinnedItemSchema.parse(input);
  const row = pinnedItemToRow(item);
  getDb()
    .insert(pinnedSkills)
    .values(row)
    .onConflictDoUpdate({
      // id, scope and createdAt are immutable; update the mutable fields.
      target: pinnedSkills.id,
      set: {
        ref: row.ref,
        label: row.label,
        position: row.position,
      },
    })
    .run();
  return item;
}

export function deletePin(id: string): void {
  getDb().delete(pinnedSkills).where(eq(pinnedSkills.id, id)).run();
}
