/**
 * MCP (Model Context Protocol) server enums shared across both processes. The
 * Agent SDK lets a session talk to user-registered MCP servers; FlowState
 * manages that list itself and passes it into every `query()`.
 *
 * Values are byte-identical to the SDK's own wire strings (the `type`
 * discriminant on `McpServerConfig`, and the `status` field on
 * `McpServerStatus`) so they narrow the SDK unions and serialize over IPC
 * unchanged.
 */

/** Transport a registered MCP server speaks over. */
export enum McpTransport {
  /** A local command the SDK spawns and talks to over stdio. */
  Stdio = 'stdio',
  /** A remote server reached over streamable HTTP. */
  Http = 'http',
  /** A remote server reached over Server-Sent Events. */
  Sse = 'sse',
}

/** Live connection state the SDK reports for a server (mirrors `McpServerStatus.status`). */
export enum McpConnectionStatus {
  Connected = 'connected',
  Failed = 'failed',
  NeedsAuth = 'needs-auth',
  Pending = 'pending',
  Disabled = 'disabled',
}
