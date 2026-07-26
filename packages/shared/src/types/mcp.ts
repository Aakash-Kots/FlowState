/**
 * MCP server shapes shared between the main process and the renderer.
 * Enumerations live in `../enums/mcp`; runtime validation lives in
 * `../schemas/mcp`.
 */
import type { McpConnectionStatus, McpTransport } from '../enums/mcp';

/**
 * A user-registered MCP server, persisted (encrypted) in the main process and
 * mapped to the SDK's `McpServerConfig` at session start. `command`/`args`/`env`
 * apply to stdio servers; `url`/`headers` apply to http & sse servers.
 */
export type McpServerConfig = {
  /** Unique name — also the key under which the SDK registers the server. */
  name: string;
  transport: McpTransport;
  /** When false, the server is kept in the list but not passed to the SDK. */
  enabled: boolean;
  /** stdio: the command to spawn (e.g. `npx`). */
  command?: string;
  /** stdio: arguments passed to the command. */
  args?: string[];
  /** stdio: extra environment variables for the spawned process (may hold secrets). */
  env?: Record<string, string>;
  /** http/sse: the server URL. */
  url?: string;
  /** http/sse: request headers (may hold auth tokens). */
  headers?: Record<string, string>;
};

/**
 * The redacted view of a server sent to the renderer. Non-secret structural
 * fields (command/args/url) are included so the Settings form can edit them;
 * secret values (env, headers) never leave the main process — only whether any
 * are set (`hasSecrets`).
 */
export type McpServerSummary = {
  name: string;
  transport: McpTransport;
  enabled: boolean;
  command?: string;
  args?: string[];
  url?: string;
  /** Whether the server carries any env vars or headers (secret-bearing fields). */
  hasSecrets: boolean;
};

/** Live connection status for a server on a running session (from the SDK). */
export type McpServerLiveStatus = {
  name: string;
  status: McpConnectionStatus;
  /** Tool names the server exposes (present once connected). */
  tools: string[];
  /** Failure detail when `status` is `failed`. */
  error?: string;
};
