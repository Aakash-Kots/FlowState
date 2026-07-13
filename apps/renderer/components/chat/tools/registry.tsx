'use client';

import type { ComponentType } from 'react';
import type { ToolRowProps } from '@/lib/types/chat';
import { DefaultToolRow } from './DefaultToolRow';
import {
  BashToolRow,
  EditToolRow,
  GlobToolRow,
  GrepToolRow,
  McpToolRow,
  MultiEditToolRow,
  ReadToolRow,
  TaskToolRow,
  TodoWriteToolRow,
  WebFetchToolRow,
  WriteToolRow,
} from './rows';

///////////////
// Constants //
///////////////

/** Tool name → bespoke row. Names are raw SDK strings, so this is a plain map
 * rather than an enum; `mcp__*` tools and everything unlisted are routed by
 * `rowForTool` below. */
const TOOL_ROWS: Record<string, ComponentType<ToolRowProps>> = {
  Edit: EditToolRow,
  MultiEdit: MultiEditToolRow,
  Read: ReadToolRow,
  Write: WriteToolRow,
  Grep: GrepToolRow,
  Glob: GlobToolRow,
  Bash: BashToolRow,
  TodoWrite: TodoWriteToolRow,
  WebFetch: WebFetchToolRow,
  Task: TaskToolRow,
};

////////////
// Export //
////////////

/** The row component for a tool name: a bespoke row, the MCP row for `mcp__*`
 * tools, or the raw-JSON fallback for everything else. */
export function rowForTool(name: string): ComponentType<ToolRowProps> {
  if (TOOL_ROWS[name]) return TOOL_ROWS[name];
  if (name.startsWith('mcp__')) return McpToolRow;
  return DefaultToolRow;
}
