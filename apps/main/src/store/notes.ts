/**
 * Persistence for the header notes pads — the freeform Markdown scratchpad the
 * user jots into from the header. Exactly one row exists per scope: the app-wide
 * Global pad (`workspaceId` null) or a per-worktree pad. Rows are validated
 * against the shared `noteSchema` on the way out, so the database can never hand
 * back a malformed Note.
 */
import { randomUUID } from 'node:crypto';
import { type Note, noteSchema } from '@flowstate/shared';
import { eq, isNull } from 'drizzle-orm';
import { getDb } from './db';
import { notes } from './schema';

type NoteRow = typeof notes.$inferSelect;

function rowToNote(row: NoteRow): Note {
  return noteSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    body: row.body,
    updatedAt: row.updatedAt,
  });
}

/** A scope's pad: `null` → the Global pad, else that worktree's. Null if unsaved. */
export function getNote(workspaceId: string | null): Note | null {
  const row = getDb()
    .select()
    .from(notes)
    .where(workspaceId === null ? isNull(notes.workspaceId) : eq(notes.workspaceId, workspaceId))
    .get();
  return row ? rowToNote(row) : null;
}

/**
 * Save a scope's pad (get-or-create): update the existing row's body, or insert a
 * new row keyed by a fresh id. Returns the validated Note.
 */
export function saveNote(workspaceId: string | null, body: string): Note {
  const existing = getNote(workspaceId);
  const note = noteSchema.parse({
    id: existing?.id ?? randomUUID(),
    workspaceId,
    body,
    updatedAt: new Date().toISOString(),
  });
  if (existing) {
    getDb()
      .update(notes)
      .set({ body: note.body, updatedAt: note.updatedAt })
      .where(eq(notes.id, note.id))
      .run();
  } else {
    getDb().insert(notes).values(note).run();
  }
  return note;
}
