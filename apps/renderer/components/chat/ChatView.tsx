'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatBlockType, ChatMessageRole, ClaudeSessionState } from '@flowstate/shared';
import { ActivityIndicator } from '@/lib/enums/chat';
import type { ToolResultBlock } from '@/lib/types/chat';
import { useChat } from '@/lib/chat';
import { formatDuration } from '@/lib/format';
import { EmptyChat } from './EmptyChat';
import { Markdown } from './Markdown';
import { MessageBubble } from './MessageBubble';

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
  const pendingCount = useChat((s) => s.pendingPermissions.length + s.pendingQuestions.length);
  const sessionState = useChat((s) => s.sessionState);
  const runStartedAt = useChat((s) => s.runStartedAt);
  const elapsed = useElapsed(runStartedAt);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Index every tool result (and every tool call id) across the conversation
  // so a call and its output render together.
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

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, activeIndicator, pendingCount]);

  const showWorking = sessionState === ClaudeSessionState.Running && !streamingText;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      data-chat-scroll
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 pb-40 pt-6">
        {messages.length === 0 && !streamingText && <EmptyChat />}

        {messages.map(({ message }) => {
          // Tool messages whose results all render inside a tool_use row
          // produce empty bubbles — skip them entirely.
          if (
            message.role === ChatMessageRole.Tool &&
            message.blocks.every(
              (b) => b.type === ChatBlockType.ToolResult && toolUseIds.has(b.toolUseId),
            )
          ) {
            return null;
          }
          return (
            <MessageBubble
              key={message.id}
              message={message}
              toolResults={toolResults}
              toolUseIds={toolUseIds}
            />
          );
        })}

        {streamingText && <Markdown>{streamingText}</Markdown>}

        {(showWorking || activeIndicator) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
            {activeIndicator === ActivityIndicator.Thinking
              ? 'Thinking…'
              : activeIndicator === ActivityIndicator.Tool
                ? 'Running a tool…'
                : 'Working…'}
            {elapsed != null && (
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
