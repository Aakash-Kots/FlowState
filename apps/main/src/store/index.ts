/**
 * FlowState's local persistence layer. SQLite (better-sqlite3) holds structured
 * state — workspaces, Claude transcripts, settings — and safeStorage holds
 * secrets. Local-first by design: no server, no cloud database.
 */
import { closeDb, openDb } from './db';
import { pruneActivityEventsBefore } from './activity';
import { pruneUsageEventsBefore } from './usage';

/**
 * How long the append-only analytics ledgers (`usage_events`, `activity_events`)
 * retain rows. They grow one row per turn / action forever otherwise, and the
 * all-time aggregates scan the whole table — a year of local history is ample
 * for the analytics page while keeping those scans bounded.
 */
const LEDGER_RETENTION_DAYS = 365;

/** Open the database and run migrations. Call once on app startup. */
export function initStore(): void {
  openDb();
  pruneOldLedgers();
}

/** Best-effort one-shot retention sweep of the analytics ledgers on startup. */
function pruneOldLedgers(): void {
  try {
    const cutoff = new Date(Date.now() - LEDGER_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    pruneUsageEventsBefore(cutoff);
    pruneActivityEventsBefore(cutoff);
  } catch (err) {
    console.warn('[store] ledger retention sweep failed', err);
  }
}

/** Close the database. Call on app quit. */
export function closeStore(): void {
  closeDb();
}

export { getDb } from './db';
export * from './workspaces';
export * from './tabs';
export * from './terminals';
export * from './projects';
export * from './pins';
export * from './notes';
export * from './embeddings';
export * from './transcripts';
export * from './usage';
export * from './activity';
export * from './analytics';
export * from './secrets';
export * from './settings';
