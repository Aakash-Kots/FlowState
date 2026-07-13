/**
 * Renderer-only narrowings of the shared `ChatBlock` union, shared by the chat
 * components that render tool calls and their results.
 */
import { ChatBlockType, type ChatBlock } from '@flowstate/shared';

export type ToolUseBlock = Extract<ChatBlock, { type: ChatBlockType.ToolUse }>;
export type ToolResultBlock = Extract<ChatBlock, { type: ChatBlockType.ToolResult }>;

/** Props every per-tool chat row receives: the tool call and its paired result
 * (absent while the tool is still running). */
export type ToolRowProps = { block: ToolUseBlock; result?: ToolResultBlock };
