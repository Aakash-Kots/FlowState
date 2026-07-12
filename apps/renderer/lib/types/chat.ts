/**
 * Renderer-only narrowings of the shared `ChatBlock` union, shared by the chat
 * components that render tool calls and their results.
 */
import { ChatBlockType, type ChatBlock } from '@flowstate/shared';

export type ToolUseBlock = Extract<ChatBlock, { type: ChatBlockType.ToolUse }>;
export type ToolResultBlock = Extract<ChatBlock, { type: ChatBlockType.ToolResult }>;
