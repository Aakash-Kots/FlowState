'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatBlockType, ClaudeSessionState } from '@flowstate/shared';
import { ActivityIndicator, ChatItemKind } from '@/lib/enums/chat';
import type { ToolResultBlock, ToolUseBlock } from '@/lib/types/chat';
import { groupChatItems } from '@/lib/chatItems';
import { useChat } from '@/lib/chat';
import { formatDuration } from '@/lib/format';
import { EmptyChat } from './EmptyChat';
import { Markdown } from './Markdown';
import { MessageBubble } from './MessageBubble';
import { PlanMessage } from './PlanMessage';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolGroup } from './ToolGroup';

const NEAR_BOTTOM_PX = 80;

/** Live elapsed milliseconds since `startedAt`, ticking each second (null = off). */
function useElapsed(startedAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt == null ? null : Math.max(0, now - startedAt);
}

/**
 * Scrollable conversation: persisted messages then the in-flight streaming
 * bubble. Permission/question prompts render in the floating input bar, not
 * here. Auto-scrolls only while the user is already near the bottom so
 * scrollback isn't yanked away mid-stream.
 */
export function ChatView() {
  const messages = useChat((s) => s.messages);
  const streamingText = useChat((s) => s.streamingText);
  const activeIndicator = useChat((s) => s.activeIndicator);
  const toolProgress = useChat((s) => s.toolProgress);
  const apiRetry = useChat((s) => s.apiRetry);
  const pendingCount = useChat((s) => s.pendingPermissions.length + s.pendingQuestions.length);
  const sessionState = useChat((s) => s.sessionState);
  const runStartedAt = useChat((s) => s.runStartedAt);
  const elapsed = useElapsed(runStartedAt);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Index every tool result (and every tool call id) across the conversation so a
  // call and its output render together, plus group subagent calls by their parent
  // Task id so the Task row can render them nested.
  const { toolResults, toolUseIds, childrenByParent } = useMemo(() => {
    const results = new Map<string, ToolResultBlock>();
    const ids = new Set<string>();
    const children = new Map<string, ToolUseBlock[]>();
    for (const { message } of messages) {
      for (const block of message.blocks) {
        if (block.type === ChatBlockType.ToolResult) results.set(block.toolUseId, block);
        else if (block.type === ChatBlockType.ToolUse) {
          ids.add(block.id);
          if (block.parentToolUseId) {
            const list = children.get(block.parentToolUseId);
            if (list) list.push(block);
            else children.set(block.parentToolUseId, [block]);
          }
        }
      }
    }
    return { toolResults: results, toolUseIds: ids, childrenByParent: children };
  }, [messages]);

  // Flatten the transcript into render items: whole-message bubbles, standalone
  // text/thinking blocks, and collapsed runs of tool calls.
  const items = useMemo(() => groupChatItems(messages, toolUseIds), [messages, toolUseIds]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, activeIndicator, pendingCount, toolProgress, apiRetry]);

  const showWorking = sessionState === ClaudeSessionState.Running && !streamingText;

  // Live progress ladder: a retry beats tool progress, falling back to the
  // generic thinking/tool/working label. `showElapsed` appends the turn timer
  // except where the label already carries its own time. (Subagent progress now
  // shows as inline nested tool rows, so it has no bottom-of-chat line.)
  const progress: { text: string; warn: boolean; showElapsed: boolean } | null = apiRetry
    ? { text: `Retrying… ${apiRetry.attempt}/${apiRetry.maxRetries}`, warn: true, showElapsed: false }
    : toolProgress
      ? {
          text: `Running ${toolProgress.toolName}… · ${toolProgress.elapsedSeconds}s`,
          warn: false,
          showElapsed: false,
        }
      : null;

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
        {messages.length === 0 && !streamingText && <EmptyChat />}

        {items.map((item) => {
          switch (item.kind) {
            case ChatItemKind.Message:
              return <MessageBubble key={item.key} message={item.entry.message} />;
            case ChatItemKind.ToolGroup:
              return (
                <ToolGroup
                  key={item.key}
                  blocks={item.blocks}
                  toolResults={toolResults}
                  childrenByParent={childrenByParent}
                />
              );
            case ChatItemKind.Plan:
              return <PlanMessage key={item.key} block={item.block} />;
            case ChatItemKind.Block:
              switch (item.block.type) {
                case ChatBlockType.Text:
                  return <Markdown key={item.key}>{item.block.text}</Markdown>;
                case ChatBlockType.Thinking:
                  return <ThinkingBlock key={item.key} text={item.block.text} />;
                case ChatBlockType.ToolResult:
                  return (
                    <pre
                      key={item.key}
                      className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted p-2 font-mono text-xs text-neutral-300"
                    >
                      {item.block.content}
                    </pre>
                  );
                default:
                  return null;
              }
            default:
              return null;
          }
        })}

        {streamingText && <Markdown>{streamingText}</Markdown>}

        {(showWorking || activeIndicator || progress) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
            {progress ? (
              <span className={progress.warn ? 'text-warn' : undefined}>{progress.text}</span>
            ) : activeIndicator === ActivityIndicator.Thinking ? (
              'Thinking…'
            ) : activeIndicator === ActivityIndicator.Tool ? (
              'Running a tool…'
            ) : (
              'Working…'
            )}
            {(!progress || progress.showElapsed) && elapsed != null && (
              <span className="tabular-nums text-muted-foreground/70">
                · {formatDuration(elapsed)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
