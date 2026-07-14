/**
 * Renderer-only chat enums (not part of the cross-process protocol).
 */

/** What the agent is doing between text, for the activity indicator. */
export enum ActivityIndicator {
  Thinking = 'thinking',
  Tool = 'tool',
}

/** Kind of a flattened transcript render item (see `groupChatItems`). */
export enum ChatItemKind {
  /** A whole-message bubble — a user prompt or the end-of-turn result footer. */
  Message = 'message',
  /** A standalone assistant block: text, thinking, or an orphan tool result. */
  Block = 'block',
  /** A maximal contiguous run of tool calls, collapsed under one summary bar. */
  ToolGroup = 'toolgroup',
}
