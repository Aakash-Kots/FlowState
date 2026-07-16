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
  Image = 'image',
}

/**
 * Media type of an attached image — the four base64 image formats the Agent
 * SDK's `Base64ImageSource` accepts. Values are the wire MIME strings so they
 * pass straight to the SDK and into an `<img>` data URL unchanged.
 */
export enum ImageMediaType {
  Png = 'image/png',
  Jpeg = 'image/jpeg',
  Gif = 'image/gif',
  Webp = 'image/webp',
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
  QuestionRequest = 'question_request',
  QuestionResolved = 'question_resolved',
  Config = 'config',
  Cwd = 'cwd',
  // The tab's transcript + session were reset (the `/clear` action) — the
  // renderer empties its message store back to a fresh conversation.
  Cleared = 'cleared',
  Title = 'title',
  WorktreeName = 'worktree_name',
  // The session's available skills (SDK slash commands) changed — replaces the
  // renderer's cached list. Fired at init and on the SDK's mid-session push.
  SkillsUpdated = 'skills_updated',
  // Live per-turn progress signals — all ephemeral, never persisted, cleared
  // when the turn advances or finalizes (mirrors TextDelta / BlockStart).
  ToolProgress = 'tool_progress',
  ApiRetry = 'api_retry',
  Error = 'error',
}

/**
 * Reasoning-effort level for a Claude session — mirrors the Agent SDK's
 * `EffortLevel`. Higher levels let the model think longer before responding;
 * which levels a given model supports is reported per-model by the SDK.
 */
export enum ReasoningEffort {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  XHigh = 'xhigh',
  Max = 'max',
}

/** Outcome of a tool-permission decision. */
export enum PermissionBehavior {
  Allow = 'allow',
  Deny = 'deny',
}

/**
 * How a session handles tool-permission prompts — values are the Agent SDK's
 * `permissionMode` wire strings, so they pass straight to the SDK query and
 * `setPermissionMode` with no translation. (The SDK also has `'acceptEdits'`,
 * which the app doesn't expose.) The UI labels `BypassPermissions` "Auto-accept".
 */
export enum PermissionMode {
  Default = 'default', // prompt per tool
  Plan = 'plan', // plan first, no edits
  BypassPermissions = 'bypassPermissions', // auto-accept everything, no prompts
}
