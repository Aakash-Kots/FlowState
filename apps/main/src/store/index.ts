/**
 * FlowState's local persistence layer. SQLite (better-sqlite3) holds structured
 * state — workspaces, Claude transcripts, settings — and safeStorage holds
 * secrets. Local-first by design: no server, no cloud database.
 */
import { closeDb, openDb } from './db';

/** Open the database and run migrations. Call once on app startup. */
export function initStore(): void {
  openDb();
}

/** Close the database. Call on app quit. */
export function closeStore(): void {
  closeDb();
}

export { getDb } from './db';
export * from './workspaces';
export * from './tabs';
export * from './projects';
export * from './transcripts';
export * from './secrets';
export * from './settings';
