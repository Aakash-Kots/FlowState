'use client';

import { Loader2, X } from 'lucide-react';
import type { BackgroundTask } from '@flowstate/shared';
import { dismissBackgroundTasks, useChat, useTabId } from '@/lib/chat';
import { colorForTool, iconForTool, verbForTool } from '@/lib/constants/tools';
import { formatDuration } from '@/lib/format';
import { useElapsed } from '@/lib/hooks/useElapsed';

//////////////
// Helpers  //
//////////////

// Background agents read as subagents — reuse the `Task` tool's icon (Bot) and
// signature color (fuchsia) so they look consistent with inline subagent rows.
const AGENT_ICON = iconForTool('Task');
const AGENT_COLOR = colorForTool('Task');

/** Compact token count: `840`, `12.3k`, `1.2M`. */
function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

///////////////////
// Sub-components //
///////////////////

/** One running background agent: level entry joined with its live detail. */
function BackgroundAgentCard({ task }: { task: BackgroundTask }) {
  const detail = useChat((s) => s.backgroundTaskDetails[task.id]);
  // The SDK gives no per-task start time; the store stamps a first-seen time when
  // the task appears, so the elapsed timer survives navigating away and back.
  const startedAt = useChat((s) => s.backgroundTaskStartedAt[task.id] ?? null);
  const elapsed = useElapsed(startedAt);

  const title = detail?.subagentType ?? task.description;
  const meta: string[] = [];
  if (detail?.totalTokens != null) meta.push(`${formatTokens(detail.totalTokens)} tokens`);
  if (detail?.toolUses != null) meta.push(`${detail.toolUses} ${detail.toolUses === 1 ? 'tool' : 'tools'}`);
  if (detail?.lastToolName) meta.push(`${verbForTool(detail.lastToolName)}…`);
  if (elapsed != null) meta.push(formatDuration(elapsed));

  return (
    <div className="rounded-lg border border-border bg-secondary p-3">
      <div className="flex items-start gap-2.5">
        <AGENT_ICON className={`mt-0.5 size-4 shrink-0 ${AGENT_COLOR}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-100">{title}</p>
          {detail?.subagentType && task.description ? (
            <p className="truncate text-xs text-muted-foreground">{task.description}</p>
          ) : null}
          {detail?.prompt ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {detail.prompt}
            </p>
          ) : null}
          {meta.length > 0 ? (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">{meta.join(' · ')}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

//////////////////
// Primary view //
//////////////////

/**
 * A live overlay covering the transcript while background agents run. Driven by
 * the level set (`backgroundTasks`): mounted only when the set is non-empty (see
 * ChatWorkspace), and each card enriched by `backgroundTaskDetails`. When the
 * set empties, the parent unmounts this and the normal chat view is revealed.
 */
export function BackgroundAgentsOverlay() {
  const tabId = useTabId();
  const tasks = useChat((s) => s.backgroundTasks);

  return (
    <div
      // No z-index: as a sibling rendered before <InputBar/> (which is absolute
      // with auto z), plain paint order stacks this above <ChatView/> yet below
      // the composer, so the input stays visible and clickable while agents run.
      className="absolute inset-0 flex flex-col overflow-y-auto bg-background/95 p-4 backdrop-blur-sm"
      style={{ paddingBottom: 'calc(var(--input-h, 9rem) + 0.75rem)' }}
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-100">
        <Loader2 className="size-4 animate-spin text-warn" />
        {tasks.length} background {tasks.length === 1 ? 'agent' : 'agents'} running
        {/* Hide the overlay for this batch (agents keep running); the store
            re-surfaces it for the next batch once this set empties. */}
        <button
          type="button"
          onClick={() => dismissBackgroundTasks(tabId)}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-neutral-100"
        >
          <X className="size-3.5" />
          Dismiss
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <BackgroundAgentCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
