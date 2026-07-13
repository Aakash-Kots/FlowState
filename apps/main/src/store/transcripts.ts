/**
 * Persistence for Claude Code session transcripts. Messages are appended as they
 * stream and replayed when a tab reopens, so its agent history survives a
 * restart. Rows are keyed by the owning **tab** (a workspace holds up to
 * MAX_TABS_PER_WORKSPACE independent chat sessions); `workspace_id` is kept for
 * cascade + back-compat. `content` is the raw SDK payload, stored as JSON.
 */
import { type ClaudeMessage, claudeMessageSchema } from '@flowstate/shared';
import { asc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { claudeMessages } from './schema';

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

/**
 * Delete a tab's transcript. Done explicitly on tab close: SQLite adds the
 * `tab_id` FK via ALTER TABLE, which can't carry ON DELETE CASCADE, so the
 * rows don't cascade on their own.
 */
export function deleteTabTranscript(tabId: string): void {
  getDb().delete(claudeMessages).where(eq(claudeMessages.tabId, tabId)).run();
}
