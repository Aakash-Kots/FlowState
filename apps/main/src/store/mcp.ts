/**
 * Persistence for the user's registered MCP servers. The whole list is stored as
 * one encrypted blob via `safeStorage` (see `secrets.ts`) rather than the plain
 * `settings` KV table — env vars and request headers routinely carry API tokens,
 * so no part of a server config should touch disk in plaintext. Read defensively:
 * a stale/corrupt shape degrades to an empty list rather than throwing.
 */
import { mcpServerListSchema, type McpServerConfig } from '@flowstate/shared';
import { SecretName } from '../lib/enums/secret';
import { getSecret, setSecret } from './secrets';

export function getMcpServers(): McpServerConfig[] {
  const raw = getSecret(SecretName.McpServers);
  if (!raw) return [];
  try {
    const parsed = mcpServerListSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function setMcpServers(list: McpServerConfig[]): void {
  setSecret(SecretName.McpServers, JSON.stringify(list));
}
