/**
 * Drizzle schema — the single source of truth for FlowState's local SQLite
 * database. Edit these tables, then run `bun run db:generate` (drizzle-kit) to
 * produce a versioned SQL migration under `apps/main/drizzle/`, which is applied
 * at startup by `db.ts`. Column shapes mirror the shared zod schemas
 * (`packages/shared/src/schemas/`); the query modules re-validate on read/write.
 */
import { blob, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
    // 'chat' (Claude session) or 'file' (in-tab editor). Legacy rows default to chat.
    kind: text('kind').notNull().default('chat'),
    // For file tabs, the worktree-relative path being edited; null for chat tabs.
    filePath: text('file_path'),
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

// An append-only ledger of Claude usage — one row per finalized `result` turn.
// The SDK reports each turn's API-equivalent `total_cost_usd` plus its token
// usage; on a subscription that cost is money not spent, so this is the raw
// material for a future spend/savings analyser (spend-by-day, per-workspace,
// per-model). `workspace_id`/`tab_id` are denormalized text (no FK) on purpose:
// the ledger must survive workspace/tab deletion. Token summaries live only
// here, never in the transcript JSON, so `claude_messages` rows stay lean.
export const usageEvents = sqliteTable(
  'usage_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workspaceId: text('workspace_id').notNull(),
    tabId: text('tab_id'),
    // Identity snapshot taken at write time so the ledger can still label spend
    // after the workspace/project rows are hard-deleted (the join goes null).
    workspaceName: text('workspace_name'),
    branch: text('branch'),
    projectId: text('project_id'),
    projectName: text('project_name'),
    sessionId: text('session_id').notNull(),
    // The model the SDK actually ran, or null if the init message never reported one.
    model: text('model'),
    costUsd: real('cost_usd').notNull(),
    durationMs: integer('duration_ms'),
    numTurns: integer('num_turns'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    cacheCreationTokens: integer('cache_creation_tokens'),
    isError: integer('is_error', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_usage_events_workspace').on(t.workspaceId),
    index('idx_usage_events_created').on(t.createdAt),
  ],
);

// An append-only ledger of user activity — one row per meaningful action (a
// commit, a finished Setup/Run script, a Linear state change, a Spotify play).
// The analytics page reads these back as time-series aggregates. `type` mirrors
// the JSON payload's discriminant (kept as a column for cheap filtering/index);
// `data` is the full payload as JSON. `workspace_id`/`project_id` are
// denormalized text (no FK) on purpose, like `usage_events`: the ledger must
// survive workspace/project deletion.
export const activityEvents = sqliteTable(
  'activity_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(), // ActivityType
    workspaceId: text('workspace_id'),
    projectId: text('project_id'),
    data: text('data').notNull(), // JSON (activityDataSchema)
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_activity_events_type').on(t.type),
    index('idx_activity_events_created').on(t.createdAt),
    // Analytics reads filter by `type` AND a `created_at` range together (e.g.
    // terminal-run stats); a composite index lets both predicates use the index
    // instead of scanning one dimension and filtering the other.
    index('idx_activity_events_type_created').on(t.type, t.createdAt),
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
  // Branch new worktrees are cut from, overriding `default_branch`; null uses the default.
  worktreeBaseBranch: text('worktree_base_branch'),
  private: integer('private', { mode: 'boolean' }).notNull(),
  // Project-scoped shell commands for the Setup/Run default terminals; null until set.
  setupScript: text('setup_script'),
  runScript: text('run_script'),
  createdAt: text('created_at').notNull(),
});

// A pinned shortcut in a worktree's Skills & Actions panel. Exactly one scope FK
// is set: `project_id` (repo-scope, shown for every worktree of the repo) or
// `workspace_id` (worktree-scope). Both cascade-delete with their parent. `ref`
// is the skill name (no leading slash) or a built-in action id.
export const pinnedSkills = sqliteTable(
  'pinned_skills',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // PinnedItemKind: 'skill' | 'action'
    ref: text('ref').notNull(),
    label: text('label').notNull(),
    position: integer('position').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_pinned_skills_project').on(t.projectId),
    index('idx_pinned_skills_workspace').on(t.workspaceId),
  ],
);

// A freeform Markdown notes pad. `workspace_id` null is the app-wide Global pad;
// a set `workspace_id` scopes the pad to that worktree (cascade-deletes with it).
// One row per scope, enforced by the store (get-or-create).
export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    body: text('body').notNull().default(''),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_notes_workspace').on(t.workspaceId)],
);

// A cached semantic-search embedding for one Linear ticket. The local embedding
// model (EmbeddingGemma via node-llama-cpp) vectorizes each ticket's
// identifier+title once; `content_hash` (a hash of the embedded text) lets the
// reindexer skip unchanged tickets and re-embed only edited ones. `vector` is
// the L2-normalized Float32 embedding as a raw little-endian buffer (blob), so
// cosine similarity is a plain dot product in JS — the corpus is small enough
// (hundreds/low-thousands per team) that brute-force beats a vector extension.
// `identifier`/`title` are denormalized so a hit can be labeled without a live
// Linear fetch. No FK to a workspace: this is an API-derived cache, not user
// state, and `team_id` is Linear's own id.
export const linearIssueEmbeddings = sqliteTable(
  'linear_issue_embeddings',
  {
    issueId: text('issue_id').primaryKey(),
    teamId: text('team_id').notNull(),
    identifier: text('identifier').notNull(),
    title: text('title').notNull(),
    model: text('model').notNull(), // LocalModelId the vector was produced by
    dim: integer('dim').notNull(), // Matryoshka output width of `vector`
    contentHash: text('content_hash').notNull(),
    vector: blob('vector', { mode: 'buffer' }).notNull(), // Float32 LE buffer
    updatedAt: integer('updated_at').notNull(), // epoch ms
  },
  (t) => [index('idx_linear_issue_embeddings_team').on(t.teamId)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON
});

export const secrets = sqliteTable('secrets', {
  name: text('name').primaryKey(),
  ciphertext: blob('ciphertext', { mode: 'buffer' }).notNull(), // safeStorage.encryptString output
});
