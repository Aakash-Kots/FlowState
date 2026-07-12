/**
 * Enumerations for Claude Code sessions and the normalized chat protocol shared
 * between the main process and the renderer. Values are the wire strings, so
 * they serialize over IPC and persist to SQLite unchanged.
 */

/** Lifecycle of a Claude Code session bound to a workspace. */
export enum ClaudeSessionState {
  Idle = 'idle', // no session started
  Running = 'running', // agent is actively working
  Waiting = 'waiting', // paused on a permission prompt / user input
  Error = 'error', // last run errored
}

/** Role of a normalized chat message. */
export enum ChatMessageRole {
  User = 'user',
  Assistant = 'assistant',
  Tool = 'tool',
  Result = 'result',
}

/** Discriminator for a renderable chat content block. */
export enum ChatBlockType {
  Text = 'text',
  Thinking = 'thinking',
  ToolUse = 'tool_use',
  ToolResult = 'tool_result',
}

/** Discriminator for a live event streamed over the `claude.onEvent` subscription. */
export enum ChatEventKind {
  Init = 'init',
  TextDelta = 'text_delta',
  BlockStart = 'block_start',
  Message = 'message',
  State = 'state',
  PermissionRequest = 'permission_request',
  PermissionResolved = 'permission_resolved',
  Cwd = 'cwd',
  Error = 'error',
}

/** Outcome of a tool-permission decision. */
export enum PermissionBehavior {
  Allow = 'allow',
  Deny = 'deny',
}
