'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChatBlockType, ChatMessageRole, ClaudeSessionState } from '@flowstate/shared';
import { ActivityIndicator, ChatItemKind } from '@/lib/enums/chat';
import type { ChatItem, ToolResultBlock } from '@/lib/types/chat';
import { groupChatItems } from '@/lib/chatItems';
import { loadOlderMessages, useChat, useChatStoreApi, useTabId } from '@/lib/chat';
import { verbForTool } from '@/lib/constants/tools';
import { formatDuration } from '@/lib/format';
import { useElapsed } from '@/lib/hooks/useElapsed';
import { useThrottledValue } from '@/lib/hooks/useThrottledValue';
import { clearInitialising, useWorkspace } from '@/lib/workspace';
import { EmptyChat } from './EmptyChat';
import { InitialisingMessage } from './InitialisingMessage';
import { Markdown } from './Markdown';
import { MessageBubble } from './MessageBubble';
import { PlanMessage } from './PlanMessage';
import { PlanReportMessage } from './PlanReportMessage';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolUseRow } from './ToolUseRow';

///////////////
// Constants //
///////////////

const NEAR_BOTTOM_PX = 80;

/** Re-parse the live streaming markdown at most this often (ms), not per token. */
const STREAM_RENDER_INTERVAL_MS = 66;

/** Pre-measurement row height guess for the virtualizer (a short message). */
const ESTIMATED_ROW_PX = 96;

/** Rows rendered beyond the viewport on each side so scrolling never blanks. */
const OVERSCAN_ROWS = 8;

////////////////////
// Sub-components //
////////////////////

/**
 * The in-flight assistant reply. Owns the `streamingText` subscription so only
 * this leaf re-renders at token rate — ChatView (and with it the whole
 * transcript container) stays off the per-token path. Markdown re-parsing is
 * further capped to a fixed cadence: the raw text updates per token, but
 * re-running ReactMarkdown+Prism that often is O(n²) over a long reply. The
 * `streamingText` guard still hides the block the instant the turn ends, so the
 * finalized message never double-renders.
 */
function StreamingBubble() {
  const streamingText = useChat((s) => s.streamingText);
  const throttledStreamingText = useThrottledValue(streamingText, STREAM_RENDER_INTERVAL_MS);
  if (!streamingText) return null;
  return <Markdown>{throttledStreamingText ?? streamingText}</Markdown>;
}

/**
 * The live progress line under the transcript. Owns every ~1Hz subscription
 * (elapsed timer, tool progress, retry state) so their ticks re-render only
 * this leaf. A retry beats tool progress, falling back to the generic
 * thinking/tool/working label; `showElapsed` appends the turn timer except
 * where the label already carries its own time. (Subagent progress shows as
 * inline nested tool rows, so it has no bottom-of-chat line.)
 */
function WorkingIndicator() {
  const sessionState = useChat((s) => s.sessionState);
  const hasStreaming = useChat((s) => s.streamingText != null);
  const activeIndicator = useChat((s) => s.activeIndicator);
  const activeToolName = useChat((s) => s.activeToolName);
  const toolProgress = useChat((s) => s.toolProgress);
  const apiRetry = useChat((s) => s.apiRetry);
  const runStartedAt = useChat((s) => s.runStartedAt);
  const elapsed = useElapsed(runStartedAt);

  const showWorking = sessionState === ClaudeSessionState.Running && !hasStreaming;

  const progress: { text: string; warn: boolean; showElapsed: boolean } | null = apiRetry
    ? { text: `Retrying… ${apiRetry.attempt}/${apiRetry.maxRetries}`, warn: true, showElapsed: false }
    : toolProgress
      ? {
          text: `${verbForTool(toolProgress.toolName)}… · ${toolProgress.elapsedSeconds}s`,
          warn: false,
          showElapsed: false,
        }
      : null;

  if (!showWorking && !activeIndicator && !progress) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
      {progress ? (
        <span className={progress.warn ? 'text-warn' : undefined}>{progress.text}</span>
      ) : activeIndicator === ActivityIndicator.Thinking ? (
        'Thinking…'
      ) : activeIndicator === ActivityIndicator.Tool ? (
        `${verbForTool(activeToolName)}…`
      ) : (
        'Working…'
      )}
      {(!progress || progress.showElapsed) && elapsed != null && (
        <span className="tabular-nums text-muted-foreground/70">· {formatDuration(elapsed)}</span>
      )}
    </div>
  );
}

/////////////
// Helpers //
/////////////

/** Render one transcript item — the body of a virtualized row. */
function renderItem(item: ChatItem, toolResults: Map<string, ToolResultBlock>) {
  switch (item.kind) {
    case ChatItemKind.Message:
      return <MessageBubble message={item.entry.message} />;
    case ChatItemKind.Tool:
      return <ToolUseRow block={item.block} result={toolResults.get(item.block.id)} />;
    case ChatItemKind.Plan:
      return <PlanMessage block={item.block} />;
    case ChatItemKind.PlanReport:
      return <PlanReportMessage text={item.block.text} />;
    case ChatItemKind.Block:
      switch (item.block.type) {
        case ChatBlockType.Text:
          return <Markdown>{item.block.text}</Markdown>;
        case ChatBlockType.Thinking:
          return <ThinkingBlock text={item.block.text} />;
        case ChatBlockType.ToolResult:
          return (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted p-2 font-mono text-xs text-neutral-300">
              {item.block.content}
            </pre>
          );
        default:
          return null;
      }
    default:
      return null;
  }
}

//////////////
// ChatView //
//////////////

/**
 * Scrollable conversation: persisted messages (virtualized — only the rows in
 * and around the viewport exist in the DOM, so a thousand-message session
 * doesn't hold a thousand markdown trees) then the in-flight streaming bubble
 * as a plain tail outside the virtualizer, so token-rate growth never touches
 * it. Permission/question prompts render in the floating input bar, not here.
 * Auto-scrolls only while the user is already near the bottom so scrollback
 * isn't yanked away mid-stream.
 */
export function ChatView() {
  const tabId = useTabId();
  const store = useChatStoreApi();
  const messages = useChat((s) => s.messages);
  const hasMoreBefore = useChat((s) => s.hasMoreBefore);
  const loadingOlder = useChat((s) => s.loadingOlder);
  // Edge-only booleans (null↔non-null / any-response), not the streamed text
  // itself — this component must not re-render per token.
  const hasStreaming = useChat((s) => s.streamingText != null);
  const hasResponse = useChat(
    (s) =>
      s.streamingText != null ||
      s.messages.some(({ message }) => message.role !== ChatMessageRole.User),
  );

  // A freshly-created ticket-linked worktree shows "Initialising worktree with
  // ticket …" until its first assistant response (streamed text or a persisted
  // assistant/tool message) lands, at which point we retire the marker.
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const initialisingIssue = useWorkspace((s) => s.initialisingIssue[workspaceId]);
  useEffect(() => {
    if (initialisingIssue && hasResponse) clearInitialising(workspaceId);
  }, [initialisingIssue, hasResponse, workspaceId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Index every tool result (and every tool call id) across the conversation so a
  // call and its output render together.
  const { toolResults, toolUseIds } = useMemo(() => {
    const results = new Map<string, ToolResultBlock>();
    const ids = new Set<string>();
    for (const { message } of messages) {
      for (const block of message.blocks) {
        if (block.type === ChatBlockType.ToolResult) results.set(block.toolUseId, block);
        else if (block.type === ChatBlockType.ToolUse) ids.add(block.id);
      }
    }
    return { toolResults: results, toolUseIds: ids };
  }, [messages]);

  // Flatten the transcript into render items: whole-message bubbles, standalone
  // text/thinking blocks, and individual inline tool-call rows.
  const items = useMemo(() => groupChatItems(messages, toolUseIds), [messages, toolUseIds]);

  // Keyed by the item's stable key (not index) so measurements survive
  // "Load earlier" prepends without remeasuring every row.
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: OVERSCAN_ROWS,
    getItemKey: (index) => items[index]?.key ?? index,
  });

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  // Auto-scroll runs off the render path: an imperative store subscription
  // schedules one coalesced rAF per burst of scroll-relevant changes (tokens,
  // new messages, progress ticks), instead of a React effect re-running per
  // change. A second rAF pass re-pins after the virtualizer's async row
  // measurements settle the true scrollHeight.
  useEffect(() => {
    let raf = 0;
    const pin = () => {
      const el = scrollRef.current;
      if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        pin();
        raf = requestAnimationFrame(() => {
          raf = 0;
          pin();
        });
      });
    };
    schedule(); // Initial pin on mount / tab switch.
    const unsubscribe = store.subscribe((state, prev) => {
      if (
        state.messages !== prev.messages ||
        state.streamingText !== prev.streamingText ||
        state.activeIndicator !== prev.activeIndicator ||
        state.toolProgress !== prev.toolProgress ||
        state.apiRetry !== prev.apiRetry ||
        state.pendingPermissions !== prev.pendingPermissions ||
        state.pendingQuestions !== prev.pendingQuestions
      ) {
        schedule();
      }
    });
    return () => {
      unsubscribe();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [store]);

  // Absolute-positioned virtual rows defeat native scroll anchoring, so a
  // "Load earlier" prepend compensates manually: keep the viewport anchored by
  // offsetting scrollTop by the height the new rows added.
  const handleLoadOlder = async () => {
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    await loadOlderMessages(tabId);
    requestAnimationFrame(() => {
      const after = scrollRef.current;
      if (after) after.scrollTop = prevTop + (after.scrollHeight - prevHeight);
    });
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      data-chat-scroll
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div
        className="mx-auto flex max-w-3xl flex-col gap-4 px-5 pt-6"
        // Reserve room for the floating composer (its live height is published as
        // `--input-h`) plus a small gap, so content rests just above the textbox
        // instead of scrolling under it. Falls back before the bar first measures.
        style={{ paddingBottom: 'calc(var(--input-h, 9rem) + 0.75rem)' }}
      >
        {initialisingIssue && <InitialisingMessage issue={initialisingIssue} />}

        {hasMoreBefore && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={() => void handleLoadOlder()}
              disabled={loadingOlder}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {messages.length === 0 && !hasStreaming && !initialisingIssue && <EmptyChat />}

        {items.length > 0 && (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = items[virtualItem.index];
              if (!item) return null;
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full pb-4"
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                >
                  {renderItem(item, toolResults)}
                </div>
              );
            })}
          </div>
        )}

        <StreamingBubble />
        <WorkingIndicator />
      </div>
    </div>
  );
}
