/**
 * Renderer-only narrowings of the shared `ChatBlock` union, shared by the chat
 * components that render tool calls and their results.
 */
import { ChatBlockType, type ChatBlock, type ChatSnapshotEntry } from '@flowstate/shared';
import type { ChatItemKind } from '@/lib/enums/chat';

export type ToolUseBlock = Extract<ChatBlock, { type: ChatBlockType.ToolUse }>;
export type ToolResultBlock = Extract<ChatBlock, { type: ChatBlockType.ToolResult }>;
export type TextBlock = Extract<ChatBlock, { type: ChatBlockType.Text }>;
export type ThinkingBlock = Extract<ChatBlock, { type: ChatBlockType.Thinking }>;

/** Props every per-tool chat row receives: the tool call and its paired result
 * (absent while the tool is still running). */
export type ToolRowProps = { block: ToolUseBlock; result?: ToolResultBlock };

/**
 * One item in the flattened transcript that `ChatView` renders: a whole-message
 * bubble, a standalone assistant block, or a collapsed run of tool calls. See
 * `groupChatItems`. `key` is a stable React key (a message id, `msgId:index`,
 * or the run's first tool-call id).
 */
export type ChatItem =
  | { kind: ChatItemKind.Message; key: string; entry: ChatSnapshotEntry }
  | { kind: ChatItemKind.Block; key: string; block: TextBlock | ThinkingBlock | ToolResultBlock }
  | { kind: ChatItemKind.ToolGroup; key: string; blocks: ToolUseBlock[] }
  | { kind: ChatItemKind.Plan; key: string; block: ToolUseBlock };
