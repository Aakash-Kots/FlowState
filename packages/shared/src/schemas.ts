import { z } from 'zod';

/**
 * A Linear issue reference linked to a workspace. Kept intentionally small —
 * the full issue lives in Linear; FlowState stores just enough to display and
 * link back.
 */
export const linearIssueRefSchema = z.object({
  id: z.string(),
  identifier: z.string(), // e.g. "ENG-142"
  title: z.string(),
  url: z.string().url(),
  stateName: z.string().optional(),
});

/**
 * Lifecycle of a Claude Code session bound to a workspace.
 */
export const claudeSessionStateSchema = z.enum([
  'idle', // no session started
  'running', // agent is actively working
  'waiting', // paused on a permission prompt / user input
  'error', // last run errored
]);

/**
 * A Workspace is FlowState's core unit: one git worktree plus its terminals,
 * Claude Code session, and an optionally linked Linear issue.
 */
export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  repoRoot: z.string(), // the primary repository path
  worktreePath: z.string(), // absolute path of this worktree
  branch: z.string(),
  linearIssue: linearIssueRefSchema.nullable().default(null),
  claudeState: claudeSessionStateSchema.default('idle'),
  claudeSessionId: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
});

/**
 * A single persisted message in a Claude Code session transcript. `content` is
 * the raw SDK message payload (kept as JSON) so a workspace can reopen with its
 * full agent history intact.
 */
export const claudeMessageSchema = z.object({
  role: z.string(), // 'user' | 'assistant' | 'tool' | 'system' | SDK subtype
  content: z.unknown(), // raw SDK message payload, serialized as JSON on disk
  createdAt: z.string().datetime(),
});

/** Input to create a new workspace (worktree + branch). */
export const createWorkspaceInputSchema = z.object({
  repoRoot: z.string(),
  branch: z.string(),
  baseRef: z.string().default('HEAD'),
  linearIssueId: z.string().optional(),
});

/**
 * One renderable piece of a chat message. Normalized from the Agent SDK's
 * content blocks into a small, JSON-serializable union the renderer can
 * render without knowing SDK internals.
 */
export const chatBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('thinking'), text: z.string() }),
  z.object({ type: z.literal('tool_use'), id: z.string(), name: z.string(), input: z.unknown() }),
  z.object({
    type: z.literal('tool_result'),
    toolUseId: z.string(),
    content: z.string(),
    isError: z.boolean(),
  }),
]);

/**
 * A normalized chat message — what FlowState persists inside
 * `claude_messages.content` and streams to the renderer. `id` is the SDK
 * message uuid (or a locally generated uuid for user prompts) and is used to
 * dedupe between transcript hydration and the live subscription.
 */
export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'tool', 'result']),
  blocks: z.array(chatBlockSchema),
  meta: z
    .object({
      costUsd: z.number().optional(),
      durationMs: z.number().optional(),
      numTurns: z.number().optional(),
      isError: z.boolean().optional(),
    })
    .optional(),
});

/** Live event streamed over the `claude.onEvent` subscription. */
export const chatEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('init'),
    sessionId: z.string(),
    model: z.string(),
    cwd: z.string(),
  }),
  // In-flight assistant text for the current turn; not persisted.
  z.object({ kind: z.literal('text_delta'), text: z.string() }),
  // A new content block started streaming — drives the thinking/tool indicator.
  z.object({ kind: z.literal('block_start'), blockType: z.string() }),
  // Finalized, persisted message. Authoritative: replaces any delta buffer.
  z.object({
    kind: z.literal('message'),
    message: chatMessageSchema,
    createdAt: z.string().datetime(),
  }),
  z.object({ kind: z.literal('state'), state: claudeSessionStateSchema }),
  z.object({
    kind: z.literal('permission_request'),
    id: z.string(),
    toolName: z.string(),
    input: z.unknown(),
    title: z.string().optional(),
    description: z.string().optional(),
  }),
  z.object({
    kind: z.literal('permission_resolved'),
    id: z.string(),
    behavior: z.enum(['allow', 'deny']),
  }),
  z.object({ kind: z.literal('cwd'), cwd: z.string().nullable() }),
  z.object({ kind: z.literal('error'), message: z.string() }),
]);

/** Pending permission request surfaced in snapshots (mirrors the event shape). */
export const permissionRequestSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  title: z.string().optional(),
  description: z.string().optional(),
});

/** Hydration payload for the chat workspace: state + history in one query. */
export const chatSnapshotSchema = z.object({
  state: claudeSessionStateSchema,
  sessionId: z.string().nullable(),
  cwd: z.string().nullable(),
  model: z.string().nullable(),
  messages: z.array(
    z.object({ message: chatMessageSchema, createdAt: z.string().datetime() }),
  ),
  pendingPermissions: z.array(permissionRequestSchema),
});
