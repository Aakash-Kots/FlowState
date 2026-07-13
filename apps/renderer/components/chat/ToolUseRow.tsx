'use client';

import type { ToolResultBlock, ToolUseBlock } from '@/lib/types/chat';
import { rowForTool } from './tools/registry';

/**
 * A single tool call plus its paired result, rendered by the tool's bespoke row
 * (Edit → a diff hover card, Read → the file, Grep → matches, …) or the raw-JSON
 * fallback for tools without one. Dispatch lives in `tools/registry`.
 */
export function ToolUseRow({ block, result }: { block: ToolUseBlock; result?: ToolResultBlock }) {
  const Row = rowForTool(block.name);
  return <Row block={block} result={result} />;
}
