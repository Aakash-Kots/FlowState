'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { colorForTool, iconForTool } from '@/lib/constants/tools';
import type { ToolResultBlock, ToolUseBlock } from '@/lib/types/chat';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { cn } from '../ui/cn';
import { ToolUseRow } from './ToolUseRow';

/////////////
// Helpers //
/////////////

/** Distinct tool types in a run, in first-seen order. `mcp__*` tools collapse to
 * a single `mcp` entry so a run of MCP calls shows one plug, not many. */
function distinctKinds(blocks: ToolUseBlock[]): { key: string; name: string }[] {
  const seen = new Set<string>();
  const kinds: { key: string; name: string }[] = [];
  for (const b of blocks) {
    const key = b.name.startsWith('mcp__') ? 'mcp' : b.name;
    if (seen.has(key)) continue;
    seen.add(key);
    kinds.push({ key, name: b.name });
  }
  return kinds;
}

////////////
// Export //
////////////

/**
 * A contiguous run of tool calls, collapsed under a `▸ N tool calls` summary bar
 * that previews the distinct tool types as icons. The run auto-collapses once
 * every call has a result; while any call is still in flight it stays expanded
 * and the toggle is disabled so live output isn't hidden.
 */
export function ToolGroup({
  blocks,
  toolResults,
  childrenByParent,
}: {
  blocks: ToolUseBlock[];
  toolResults: Map<string, ToolResultBlock>;
  /** Subagent calls grouped by parent Task id — passed through so a Task row can
   * render its nested tool calls. Absent for a nested (subagent) group. */
  childrenByParent?: Map<string, ToolUseBlock[]>;
}) {
  const streaming = blocks.some((b) => !toolResults.has(b.id));
  const [userOpen, setUserOpen] = useState(false);
  const open = streaming || userOpen;
  const kinds = distinctKinds(blocks);

  return (
    <Collapsible open={open} onOpenChange={setUserOpen}>
      <CollapsibleTrigger
        disabled={streaming}
        className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 font-mono text-xs text-muted-foreground transition-colors enabled:hover:text-neutral-200"
      >
        <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
        <span className="shrink-0">
          {blocks.length} tool call{blocks.length === 1 ? '' : 's'}
        </span>
        <span className="flex items-center gap-1">
          {kinds.map(({ key, name }) => {
            const Icon = iconForTool(name);
            return <Icon key={key} className={cn('size-3.5', colorForTool(name))} />;
          })}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-2 mt-1.5 space-y-1.5 border-l border-border/60 pl-3">
        {blocks.map((b) => {
          // A Task call renders its subagent's tool calls as a nested group,
          // indented under the Task row — same collapse-when-done behavior.
          const subCalls = childrenByParent?.get(b.id);
          const row = <ToolUseRow key={b.id} block={b} result={toolResults.get(b.id)} />;
          if (!subCalls?.length) return row;
          return (
            <div key={b.id} className="space-y-1.5">
              {row}
              <div className="ml-2 border-l border-border/60 pl-3">
                <ToolGroup
                  blocks={subCalls}
                  toolResults={toolResults}
                  childrenByParent={childrenByParent}
                />
              </div>
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
