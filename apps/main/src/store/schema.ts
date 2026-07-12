/**
 * Drizzle schema — the single source of truth for FlowState's local SQLite
 * database. Edit these tables, then run `bun run db:generate` (drizzle-kit) to
 * produce a versioned SQL migration under `apps/main/drizzle/`, which is applied
 * at startup by `db.ts`. Column shapes mirror the shared zod schemas
 * (`packages/shared/src/schemas.ts`); the query modules re-validate on read/write.
 */
import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  repoRoot: text('repo_root').notNull(),
  worktreePath: text('worktree_path').notNull(),
  branch: text('branch').notNull(),
  linearIssue: text('linear_issue'), // JSON (linearIssueRefSchema) or null
  claudeState: text('claude_state').notNull().default('idle'),
  claudeSessionId: text('claude_session_id'),
  createdAt: text('created_at').notNull(),
});

export const claudeMessages = sqliteTable(
  'claude_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(), // JSON of the raw SDK message
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_claude_messages_workspace_session').on(t.workspaceId, t.sessionId)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON
});

export const secrets = sqliteTable('secrets', {
  name: text('name').primaryKey(),
  ciphertext: blob('ciphertext', { mode: 'buffer' }).notNull(), // safeStorage.encryptString output
});
