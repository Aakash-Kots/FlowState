'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ChatBlockType, ChatMessageRole, ClaudeSessionState } from '@flowstate/shared';
import { ActivityIndicator, ChatItemKind } from '@/lib/enums/chat';
import type { ToolResultBlock } from '@/lib/types/chat';
import { groupChatItems } from '@/lib/chatItems';
import { useChat } from '@/lib/chat';
import { verbForTool } from '@/lib/constants/tools';
import { formatDuration } from '@/lib/format';
import { useElapsed } from '@/lib/hooks/useElapsed';
import { clearInitialising, useWorkspace } from '@/lib/workspace';
import { EmptyChat } from './EmptyChat';
import { InitialisingMessage } from './InitialisingMessage';
import { Markdown } from './Markdown';
import { MessageBubble } from './MessageBubble';
import { PlanMessage } from './PlanMessage';
import { PlanReportMessage } from './PlanReportMessage';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolUseRow } from './ToolUseRow';

const NEAR_BOTTOM_PX = 80;

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
  const activeToolName = useChat((s) => s.activeToolName);
  const toolProgress = useChat((s) => s.toolProgress);
  const apiRetry = useChat((s) => s.apiRetry);
  const pendingCount = useChat((s) => s.pendingPermissions.length + s.pendingQuestions.length);
  const sessionState = useChat((s) => s.sessionState);
  const runStartedAt = useChat((s) => s.runStartedAt);
  const elapsed = useElapsed(runStartedAt);

  // A freshly-created ticket-linked worktree shows "Initialising worktree with
  // ticket …" until its first assistant response (streamed text or a persisted
  // assistant/tool message) lands, at which point we retire the marker.
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const initialisingIssue = useWorkspace((s) => s.initialisingIssue[workspaceId]);
  const hasResponse =
    Boolean(streamingText) ||
    messages.some(({ message }) => message.role !== ChatMessageRole.User);
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

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  useEffect(() => {
    // Defer the layout write to the next frame so it lands after paint instead
    // of forcing a synchronous reflow on every token / progress tick.
    const id = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
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
          text: `${verbForTool(toolProgress.toolName)}… · ${toolProgress.elapsedSeconds}s`,
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
        {initialisingIssue && <InitialisingMessage issue={initialisingIssue} />}

        {messages.length === 0 && !streamingText && !initialisingIssue && <EmptyChat />}

        {items.map((item) => {
          switch (item.kind) {
            case ChatItemKind.Message:
              return <MessageBubble key={item.key} message={item.entry.message} />;
            case ChatItemKind.Tool:
              return (
                <ToolUseRow
                  key={item.key}
                  block={item.block}
                  result={toolResults.get(item.block.id)}
                />
              );
            case ChatItemKind.Plan:
              return <PlanMessage key={item.key} block={item.block} />;
            case ChatItemKind.PlanReport:
              return <PlanReportMessage key={item.key} text={item.block.text} />;
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
              `${verbForTool(activeToolName)}…`
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
