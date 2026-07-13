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
  ReasoningEffort,
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

/**
 * A selectable Claude model for a session, mirroring the subset of the SDK's
 * `ModelInfo` the picker needs. `supportedEffortLevels` gates the effort picker.
 */
export type ModelOption = {
  value: string;
  displayName: string;
  description: string;
  supportsEffort: boolean;
  supportedEffortLevels: ReasoningEffort[];
};

/** One selectable choice within a question. */
export type QuestionOption = {
  label: string;
  description: string;
};

/** A single question in an `AskUserQuestion` prompt. */
export type QuestionItem = {
  header: string;
  question: string;
  multiSelect: boolean;
  options: QuestionOption[];
};

/**
 * A pending `AskUserQuestion` prompt from Claude, answered inline near the
 * input (selectable options plus a free-text "Other"), mirroring the CLI.
 */
export type QuestionRequest = {
  id: string;
  questions: QuestionItem[];
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
  // Claude asked a structured question (AskUserQuestion) — answered near the input.
  | { kind: ChatEventKind.QuestionRequest; id: string; questions: QuestionItem[] }
  | { kind: ChatEventKind.QuestionResolved; id: string }
  // The session's model/effort changed (e.g. the user picked a new one).
  | { kind: ChatEventKind.Config; model: string | null; effort: ReasoningEffort | null }
  | { kind: ChatEventKind.Cwd; cwd: string | null }
  // An auto-generated tab title derived from the conversation's first exchange.
  | { kind: ChatEventKind.Title; title: string }
  // An auto-generated worktree/workspace name derived from its first exchange.
  | { kind: ChatEventKind.WorktreeName; workspaceId: string; name: string }
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
  effort: ReasoningEffort | null;
  messages: ChatSnapshotEntry[];
  pendingPermissions: PermissionRequest[];
  pendingQuestions: QuestionRequest[];
};
