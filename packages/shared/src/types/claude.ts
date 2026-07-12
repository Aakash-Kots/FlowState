/**
 * Claude Code session + normalized chat protocol types shared between the main
 * process and the renderer. Enumerations live in `../enums/claude`; runtime
 * validation for the payloads that cross IPC lives in `../schemas/claude`.
 */
import type {
  ChatBlockType,
  ChatEventKind,
  ChatMessageRole,
  ClaudeSessionState,
  PermissionBehavior,
} from '../enums/claude';

/**
 * A single persisted message in a Claude Code session transcript. `content` is
 * the raw SDK message payload (kept as JSON) so a workspace can reopen with its
 * full agent history intact.
 */
export type ClaudeMessage = {
  role: string; // 'user' | 'assistant' | 'tool' | 'system' | SDK subtype
  content?: unknown; // raw SDK message payload (optional/arbitrary), serialized as JSON on disk
  createdAt: string;
};

/**
 * One renderable piece of a chat message. Normalized from the Agent SDK's
 * content blocks into a small, JSON-serializable union the renderer can render
 * without knowing SDK internals.
 */
export type ChatBlock =
  | { type: ChatBlockType.Text; text: string }
  | { type: ChatBlockType.Thinking; text: string }
  | { type: ChatBlockType.ToolUse; id: string; name: string; input?: unknown }
  | { type: ChatBlockType.ToolResult; toolUseId: string; content: string; isError: boolean };

/** Cost/timing summary attached to a finalized `result` message. */
export type ChatMessageMeta = {
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
  isError?: boolean;
};

/**
 * A normalized chat message — what FlowState persists inside
 * `claude_messages.content` and streams to the renderer. `id` is the SDK message
 * uuid (or a locally generated uuid for user prompts) and is used to dedupe
 * between transcript hydration and the live subscription.
 */
export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  blocks: ChatBlock[];
  meta?: ChatMessageMeta;
};

/** Pending permission request surfaced in snapshots (mirrors the event shape). */
export type PermissionRequest = {
  id: string;
  toolName: string;
  input?: unknown;
  title?: string;
  description?: string;
};

/** Live event streamed over the `claude.onEvent` subscription. */
export type ChatEvent =
  | { kind: ChatEventKind.Init; sessionId: string; model: string; cwd: string }
  // In-flight assistant text for the current turn; not persisted.
  | { kind: ChatEventKind.TextDelta; text: string }
  // A new content block started streaming — drives the thinking/tool indicator.
  | { kind: ChatEventKind.BlockStart; blockType: string }
  // Finalized, persisted message. Authoritative: replaces any delta buffer.
  | { kind: ChatEventKind.Message; message: ChatMessage; createdAt: string }
  | { kind: ChatEventKind.State; state: ClaudeSessionState }
  | {
      kind: ChatEventKind.PermissionRequest;
      id: string;
      toolName: string;
      input?: unknown;
      title?: string;
      description?: string;
    }
  | { kind: ChatEventKind.PermissionResolved; id: string; behavior: PermissionBehavior }
  | { kind: ChatEventKind.Cwd; cwd: string | null }
  | { kind: ChatEventKind.Error; message: string };

/** One transcript entry in a snapshot: a message plus when it was persisted. */
export type ChatSnapshotEntry = {
  message: ChatMessage;
  createdAt: string;
};

/** Hydration payload for the chat workspace: state + history in one query. */
export type ChatSnapshot = {
  state: ClaudeSessionState;
  sessionId: string | null;
  cwd: string | null;
  model: string | null;
  messages: ChatSnapshotEntry[];
  pendingPermissions: PermissionRequest[];
};
