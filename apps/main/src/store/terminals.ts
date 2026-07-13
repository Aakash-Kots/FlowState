/**
 * Persistence for the terminal domain — the shell tabs inside a workspace. Rows
 * are validated against the shared `terminalTabSchema` on the way out, so the
 * database can never hand back a malformed TerminalTab to the rest of the app.
 * `ensureDefaults` keeps the two project-scoped default tabs (Setup + Run) in
 * sync with their project's scripts.
 */
import { randomUUID } from 'node:crypto';
import {
  RUN_TAB_TITLE,
  SETUP_TAB_TITLE,
  TerminalKind,
  type Project,
  type TerminalTab,
  terminalTabSchema,
} from '@flowstate/shared';
import { asc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { terminalTabs } from './schema';

type TerminalTabRow = typeof terminalTabs.$inferSelect;

function rowToTerminalTab(row: TerminalTabRow): TerminalTab {
  return terminalTabSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    kind: row.kind,
    command: row.command,
    position: row.position,
    createdAt: row.createdAt,
  });
}

function terminalTabToRow(tab: TerminalTab): TerminalTabRow {
  return {
    id: tab.id,
    workspaceId: tab.workspaceId,
    title: tab.title,
    kind: tab.kind,
    command: tab.command,
    position: tab.position,
    createdAt: tab.createdAt,
  };
}

/** All terminal tabs in a workspace, ordered by their position (left-to-right). */
export function listTerminalTabs(workspaceId: string): TerminalTab[] {
  return getDb()
    .select()
    .from(terminalTabs)
    .where(eq(terminalTabs.workspaceId, workspaceId))
    .orderBy(asc(terminalTabs.position))
    .all()
    .map(rowToTerminalTab);
}

export function getTerminalTab(id: string): TerminalTab | null {
  const row = getDb().select().from(terminalTabs).where(eq(terminalTabs.id, id)).get();
  return row ? rowToTerminalTab(row) : null;
}

/** Insert or update a terminal tab, keyed by id. Returns the validated record. */
export function upsertTerminalTab(input: TerminalTab): TerminalTab {
  const tab = terminalTabSchema.parse(input);
  const row = terminalTabToRow(tab);
  getDb()
    .insert(terminalTabs)
    .values(row)
    .onConflictDoUpdate({
      target: terminalTabs.id,
      // id, workspaceId, kind and createdAt are immutable; update everything else.
      set: {
        title: row.title,
        command: row.command,
        position: row.position,
      },
    })
    .run();
  return tab;
}

export function deleteTerminalTab(id: string): void {
  getDb().delete(terminalTabs).where(eq(terminalTabs.id, id)).run();
}

/**
 * Seed (and keep fresh) the two project-scoped default tabs — Setup at position
 * 0, Run at position 1 — whose auto-run command tracks the project's scripts.
 * Idempotent: creates a default tab if missing, otherwise refreshes its command
 * so an edited project script flows through to the tab. Returns the full,
 * position-ordered tab list for the workspace.
 */
export function ensureDefaults(workspaceId: string, project: Project | null): TerminalTab[] {
  const existing = listTerminalTabs(workspaceId);
  const defaults: { kind: TerminalKind; title: string; command: string | null }[] = [
    { kind: TerminalKind.Setup, title: SETUP_TAB_TITLE, command: project?.setupScript ?? null },
    { kind: TerminalKind.Run, title: RUN_TAB_TITLE, command: project?.runScript ?? null },
  ];

  defaults.forEach((def, position) => {
    const current = existing.find((t) => t.kind === def.kind);
    if (current) {
      // Refresh the command if the project script changed since it was seeded.
      if (current.command !== def.command) upsertTerminalTab({ ...current, command: def.command });
      return;
    }
    upsertTerminalTab({
      id: randomUUID(),
      workspaceId,
      title: def.title,
      kind: def.kind,
      command: def.command,
      position,
      createdAt: new Date().toISOString(),
    });
  });

  return listTerminalTabs(workspaceId);
}
