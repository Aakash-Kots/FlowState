'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ChatBlockType, ChatMessageRole, ClaudeSessionState } from '@flowstate/shared';
import { ActivityIndicator } from '@/lib/enums/chat';
import type { ToolResultBlock } from '@/lib/types/chat';
import { useChat } from '@/lib/chat';
import { Markdown } from './Markdown';
import { MessageBubble } from './MessageBubble';
import { PermissionCard } from './PermissionCard';

const NEAR_BOTTOM_PX = 80;

/**
 * Scrollable conversation: persisted messages, then the in-flight streaming
 * bubble, then any pending permission cards. Auto-scrolls only while the user
 * is already near the bottom so scrollback isn't yanked away mid-stream.
 */
export function ChatView() {
  const messages = useChat((s) => s.messages);
  const streamingText = useChat((s) => s.streamingText);
  const activeIndicator = useChat((s) => s.activeIndicator);
  const pendingPermissions = useChat((s) => s.pendingPermissions);
  const sessionState = useChat((s) => s.sessionState);

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
  }, [messages, streamingText, activeIndicator, pendingPermissions]);

  const showWorking = sessionState === ClaudeSessionState.Running && !streamingText;

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-6">
        {messages.length === 0 && !streamingText && (
          <div className="flex flex-1 items-center justify-center py-24 text-sm text-muted">
            Ask Claude to build, fix, or explain something in your folder.
          </div>
        )}

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
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
            {activeIndicator === ActivityIndicator.Thinking
              ? 'Thinking…'
              : activeIndicator === ActivityIndicator.Tool
                ? 'Running a tool…'
                : 'Working…'}
          </div>
        )}

        {pendingPermissions.map((request) => (
          <PermissionCard key={request.id} request={request} />
        ))}
      </div>
    </div>
  );
}
