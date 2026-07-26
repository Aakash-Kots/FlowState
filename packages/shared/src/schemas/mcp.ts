/**
 * Runtime validation for the MCP server domain. Mirrors `../types/mcp`; each
 * schema is annotated with the type it validates so the two cannot drift.
 * `.parse()`d at every boundary — the tRPC inputs and the decrypted config blob.
 */
import { z } from 'zod';
import { McpConnectionStatus, McpTransport } from '../enums/mcp';
import type { McpServerConfig, McpServerLiveStatus, McpServerSummary } from '../types/mcp';

/**
 * A single server config. Transport-specific fields are enforced with a
 * refinement rather than a discriminated union so the persisted shape stays a
 * single flat object the form can edit incrementally.
 */
export const mcpServerConfigSchema: z.ZodType<McpServerConfig> = z
  .object({
    name: z.string().min(1),
    transport: z.nativeEnum(McpTransport),
    enabled: z.boolean(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    url: z.string().url().optional(),
    headers: z.record(z.string()).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.transport === McpTransport.Stdio) {
      if (!v.command || v.command.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A stdio server needs a command.',
          path: ['command'],
        });
      }
    } else if (!v.url || v.url.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An HTTP/SSE server needs a URL.',
        path: ['url'],
      });
    }
  });

export const mcpServerListSchema: z.ZodType<McpServerConfig[]> = z.array(mcpServerConfigSchema);

export const mcpServerSummarySchema: z.ZodType<McpServerSummary> = z.object({
  name: z.string(),
  transport: z.nativeEnum(McpTransport),
  enabled: z.boolean(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  hasSecrets: z.boolean(),
});

export const mcpServerLiveStatusSchema: z.ZodType<McpServerLiveStatus> = z.object({
  name: z.string(),
  status: z.nativeEnum(McpConnectionStatus),
  tools: z.array(z.string()),
  error: z.string().optional(),
});
