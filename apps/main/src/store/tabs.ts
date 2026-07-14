/**
 * Persistence for the Tab domain model — the Claude chat sessions inside a
 * workspace. Rows are validated against the shared `tabSchema` on the way out,
 * so the database can never hand back a malformed Tab to the rest of the app.
 */
import { type Tab, tabSchema } from '@flowstate/shared';
import { asc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { tabs } from './schema';

type TabRow = typeof tabs.$inferSelect;

function rowToTab(row: TabRow): Tab {
  return tabSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    kind: row.kind,
    filePath: row.filePath,
    claudeState: row.claudeState,
    claudeSessionId: row.claudeSessionId,
    model: row.model,
    effort: row.effort,
    permissionMode: row.permissionMode,
    position: row.position,
    createdAt: row.createdAt,
  });
}

function tabToRow(tab: Tab): TabRow {
  return {
    id: tab.id,
    workspaceId: tab.workspaceId,
    title: tab.title,
    kind: tab.kind,
    filePath: tab.filePath,
    claudeState: tab.claudeState,
    claudeSessionId: tab.claudeSessionId,
    model: tab.model,
    effort: tab.effort,
    permissionMode: tab.permissionMode,
    position: tab.position,
    createdAt: tab.createdAt,
  };
}

/** All tabs in a workspace, ordered by their position (left-to-right). */
export function listTabs(workspaceId: string): Tab[] {
  return getDb()
    .select()
    .from(tabs)
    .where(eq(tabs.workspaceId, workspaceId))
    .orderBy(asc(tabs.position))
    .all()
    .map(rowToTab);
}

/** Every tab across all workspaces — used to seed/reconcile app-wide state. */
export function listAllTabs(): Tab[] {
  return getDb().select().from(tabs).all().map(rowToTab);
}

export function getTab(id: string): Tab | null {
  const row = getDb().select().from(tabs).where(eq(tabs.id, id)).get();
  return row ? rowToTab(row) : null;
}

/** Insert or update a tab, keyed by id. Returns the validated record. */
export function upsertTab(input: Tab): Tab {
  const tab = tabSchema.parse(input);
  const row = tabToRow(tab);
  getDb()
    .insert(tabs)
    .values(row)
    .onConflictDoUpdate({
      target: tabs.id,
      // id, workspaceId and createdAt are immutable; update everything else.
      set: {
        title: row.title,
        claudeState: row.claudeState,
        claudeSessionId: row.claudeSessionId,
        permissionMode: row.permissionMode,
        position: row.position,
      },
    })
    .run();
  return tab;
}

/** Delete a tab row. Its transcript must be dropped separately (`deleteTabTranscript`). */
export function deleteTab(id: string): void {
  getDb().delete(tabs).where(eq(tabs.id, id)).run();
}
