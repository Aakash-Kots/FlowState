/**
 * Persistence for Claude Code session transcripts. Messages are appended as they
 * stream and replayed when a tab reopens, so its agent history survives a
 * restart. Rows are keyed by the owning **tab** (a workspace holds up to
 * MAX_TABS_PER_WORKSPACE independent chat sessions); `workspace_id` is kept for
 * cascade + back-compat. `content` is the raw SDK payload, stored as JSON.
 */
import { type ClaudeMessage, claudeMessageSchema } from '@flowstate/shared';
import { and, asc, desc, eq, lt } from 'drizzle-orm';
import { getDb } from './db';
import { claudeMessages } from './schema';

///////////
// Types //
///////////

/**
 * A lean transcript row for hydration: the DB row id (a paging cursor), the raw
 * JSON payload (the persisted `ChatMessage`, parsed but NOT validated here), and
 * the persist timestamp. The caller validates the `ChatMessage` shape once —
 * avoiding a second zod pass over the whole transcript on every tab open.
 */
export type TabChatRow = { id: number; content: unknown; createdAt: string };

/** A page of transcript rows plus whether older rows exist before the page. */
export type TabChatPage = { rows: TabChatRow[]; hasMoreBefore: boolean };

export function appendMessage(
  tabId: string,
  workspaceId: string,
  sessionId: string,
  message: ClaudeMessage,
): void {
  const msg = claudeMessageSchema.parse(message);
  getDb()
    .insert(claudeMessages)
    .values({
      tabId,
      workspaceId,
      sessionId,
      role: msg.role,
      content: JSON.stringify(msg.content ?? null),
      createdAt: msg.createdAt,
    })
    .run();
}

/**
 * Full history for a tab across all of its session ids. Resuming a session
 * yields a new session id, so the chat UI hydrates from the tab's whole
 * transcript rather than a single session's slice.
 */
export function getTabTranscript(tabId: string): ClaudeMessage[] {
  const rows = getDb()
    .select()
    .from(claudeMessages)
    .where(eq(claudeMessages.tabId, tabId))
    .orderBy(asc(claudeMessages.id))
    .all();
  return rows.map((row) =>
    claudeMessageSchema.parse({
      role: row.role,
      content: JSON.parse(row.content),
      createdAt: row.createdAt,
    }),
  );
}

/** Shape a newest-first fetch (with one extra row probed for `hasMoreBefore`)
 * into an oldest-first page. The extra row, if present, is dropped from the page
 * but flags that older history remains. */
function toPage(rows: { id: number; content: string; createdAt: string }[], limit: number): TabChatPage {
  const hasMoreBefore = rows.length > limit;
  const kept = hasMoreBefore ? rows.slice(0, limit) : rows;
  // Reverse newest-first → oldest-first, parsing the JSON payload once (no zod).
  const page = kept
    .slice()
    .reverse()
    .map((row) => ({ id: row.id, content: JSON.parse(row.content) as unknown, createdAt: row.createdAt }));
  return { rows: page, hasMoreBefore };
}

/**
 * The most recent `limit` transcript rows for a tab (oldest-first), plus whether
 * older rows exist. Hydration reads this instead of the whole transcript so a
 * long-running tab doesn't stall on open; older pages load on scroll-back.
 */
export function getRecentTabChatRows(tabId: string, limit: number): TabChatPage {
  const rows = getDb()
    .select({ id: claudeMessages.id, content: claudeMessages.content, createdAt: claudeMessages.createdAt })
    .from(claudeMessages)
    .where(eq(claudeMessages.tabId, tabId))
    .orderBy(desc(claudeMessages.id))
    .limit(limit + 1)
    .all();
  return toPage(rows, limit);
}

/** Transcript rows immediately before `beforeId` (oldest-first), for scroll-back paging. */
export function getTabChatRowsBefore(tabId: string, beforeId: number, limit: number): TabChatPage {
  const rows = getDb()
    .select({ id: claudeMessages.id, content: claudeMessages.content, createdAt: claudeMessages.createdAt })
    .from(claudeMessages)
    .where(and(eq(claudeMessages.tabId, tabId), lt(claudeMessages.id, beforeId)))
    .orderBy(desc(claudeMessages.id))
    .limit(limit + 1)
    .all();
  return toPage(rows, limit);
}

/**
 * Delete a tab's transcript. Done explicitly on tab close: SQLite adds the
 * `tab_id` FK via ALTER TABLE, which can't carry ON DELETE CASCADE, so the
 * rows don't cascade on their own.
 */
export function deleteTabTranscript(tabId: string): void {
  getDb().delete(claudeMessages).where(eq(claudeMessages.tabId, tabId)).run();
}
