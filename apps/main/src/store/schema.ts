/**
 * Drizzle schema — the single source of truth for FlowState's local SQLite
 * database. Edit these tables, then run `bun run db:generate` (drizzle-kit) to
 * produce a versioned SQL migration under `apps/main/drizzle/`, which is applied
 * at startup by `db.ts`. Column shapes mirror the shared zod schemas
 * (`packages/shared/src/schemas/`); the query modules re-validate on read/write.
 */
import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    // Parent project (a cloned repo). Nullable: the legacy single-workspace row
    // predates projects, and worktrees cascade-delete with their project.
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    repoRoot: text('repo_root').notNull(),
    worktreePath: text('worktree_path').notNull(),
    branch: text('branch').notNull(),
    // The branch this worktree was cut from — the PR base. Nullable: legacy rows
    // predate this column and fall back to the project's default branch.
    baseRef: text('base_ref'),
    linearIssue: text('linear_issue'), // JSON (linearIssueRefSchema) or null
    claudeState: text('claude_state').notNull().default('idle'),
    claudeSessionId: text('claude_session_id'),
    // When the user archived this worktree (ISO timestamp) or null while active.
    // Archived rows are hidden from the sidebar and force-removed from disk by
    // the background reaper once the retention delay elapses.
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_workspaces_project').on(t.projectId),
    index('idx_workspaces_archived').on(t.archivedAt),
  ],
);

// A tab is one Claude chat session inside a workspace/worktree. Up to
// MAX_TABS_PER_WORKSPACE per workspace; each owns its transcript + resume id.
export const tabs = sqliteTable(
  'tabs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    claudeSessionId: text('claude_session_id'),
    claudeState: text('claude_state').notNull().default('idle'),
    // Per-tab Claude session config; null inherits the SDK/CLI default.
    model: text('model'),
    effort: text('effort'),
    // The tab's SDK permission mode ('default' | 'plan' | 'bypassPermissions').
    permissionMode: text('permission_mode').notNull().default('default'),
    position: integer('position').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_tabs_workspace').on(t.workspaceId)],
);

// A terminal tab is one shell inside a workspace/worktree. Two default tabs
// (Setup + Run, driven by the project's scripts) are seeded per workspace,
// alongside up to MAX_TERMINALS_PER_WORKSPACE ad-hoc shells. The persisted row
// outlives its pty, which is respawned (keyed by the tab id) on demand.
export const terminalTabs = sqliteTable(
  'terminal_tabs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // 'setup' | 'run' | 'shell' (TerminalKind).
    kind: text('kind').notNull().default('shell'),
    // Auto-run command for Setup/Run (resolved project script); null for a plain shell.
    command: text('command'),
    position: integer('position').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_terminal_tabs_workspace').on(t.workspaceId)],
);

export const claudeMessages = sqliteTable(
  'claude_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // The owning tab. Nullable for rows written before tabs existed; new writes
    // always set it, and transcripts are read per tab. Cascades on tab close.
    tabId: text('tab_id').references(() => tabs.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(), // JSON of the raw SDK message
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_claude_messages_workspace_session').on(t.workspaceId, t.sessionId),
    index('idx_claude_messages_tab').on(t.tabId),
  ],
);

// A project is a GitHub repository the user has cloned into FlowState. Rows are
// created via the "Add Project" flow; the clone lives at `local_path`.
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  owner: text('owner').notNull(),
  fullName: text('full_name').notNull(),
  cloneUrl: text('clone_url').notNull(),
  localPath: text('local_path').notNull(),
  defaultBranch: text('default_branch').notNull(),
  private: integer('private', { mode: 'boolean' }).notNull(),
  // Project-scoped shell commands for the Setup/Run default terminals; null until set.
  setupScript: text('setup_script'),
  runScript: text('run_script'),
  createdAt: text('created_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON
});

export const secrets = sqliteTable('secrets', {
  name: text('name').primaryKey(),
  ciphertext: blob('ciphertext', { mode: 'buffer' }).notNull(), // safeStorage.encryptString output
});
