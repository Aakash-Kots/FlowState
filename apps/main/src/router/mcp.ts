import { z } from 'zod';
import {
  mcpServerConfigSchema,
  type McpServerConfig,
  type McpServerSummary,
} from '@flowstate/shared';
import { claudeService } from '../services/claude';
import { getMcpServers, setMcpServers } from '../store/mcp';
import { publicProcedure, router } from '../trpc';

/**
 * Global MCP server management (one list applied to every workspace). The
 * config is persisted encrypted (env/headers hold tokens), so the renderer only
 * ever sees a redacted `McpServerSummary` — secret values never leave the main
 * process. Every write applies live to running sessions via the ClaudeService.
 */

/**
 * Redact a stored config down to what's safe to show the renderer — the
 * non-secret structural fields, plus whether any secret-bearing env/headers are
 * set (never their values).
 */
function toSummary(s: McpServerConfig): McpServerSummary {
  return {
    name: s.name,
    transport: s.transport,
    enabled: s.enabled,
    command: s.command,
    args: s.args,
    url: s.url,
    hasSecrets: Boolean(
      (s.env && Object.keys(s.env).length > 0) ||
        (s.headers && Object.keys(s.headers).length > 0),
    ),
  };
}

export const mcpRouter = router({
  list: publicProcedure.query(() => getMcpServers().map(toSummary)),

  /**
   * Add a server or replace an existing one with the same name. Secret-bearing
   * fields (env/headers) are preserved when the caller omits them — the renderer
   * never receives their values, so an edit that doesn't re-enter them keeps the
   * stored secrets rather than wiping them.
   */
  upsert: publicProcedure.input(mcpServerConfigSchema).mutation(async ({ input }) => {
    const existing = getMcpServers().find((s) => s.name === input.name);
    const merged: McpServerConfig = {
      ...input,
      env: input.env ?? existing?.env,
      headers: input.headers ?? existing?.headers,
    };
    const list = getMcpServers().filter((s) => s.name !== input.name);
    list.push(merged);
    setMcpServers(list);
    await claudeService.notifyMcpServersChanged();
  }),

  remove: publicProcedure.input(z.object({ name: z.string() })).mutation(async ({ input }) => {
    setMcpServers(getMcpServers().filter((s) => s.name !== input.name));
    await claudeService.notifyMcpServersChanged();
  }),

  setEnabled: publicProcedure
    .input(z.object({ name: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      setMcpServers(
        getMcpServers().map((s) =>
          s.name === input.name ? { ...s, enabled: input.enabled } : s,
        ),
      );
      await claudeService.notifyMcpServersChanged();
    }),
});
