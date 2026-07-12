/**
 * Persistence for Claude Code session transcripts. Messages are appended as they
 * stream and replayed when a workspace reopens, so its agent history survives a
 * restart. `content` is the raw SDK payload, stored as JSON.
 */
import { type ClaudeMessage, claudeMessageSchema } from '@flowstate/shared';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { claudeMessages } from './schema';

export function appendMessage(
  workspaceId: string,
  sessionId: string,
  message: ClaudeMessage,
): void {
  const msg = claudeMessageSchema.parse(message);
  getDb()
    .insert(claudeMessages)
    .values({
      workspaceId,
      sessionId,
      role: msg.role,
      content: JSON.stringify(msg.content ?? null),
      createdAt: msg.createdAt,
    })
    .run();
}

export function getTranscript(workspaceId: string, sessionId: string): ClaudeMessage[] {
  const rows = getDb()
    .select()
    .from(claudeMessages)
    .where(and(eq(claudeMessages.workspaceId, workspaceId), eq(claudeMessages.sessionId, sessionId)))
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
