'use client';

import { ChatBlockType, ChatMessageRole, type ChatMessage } from '@flowstate/shared';
import { formatDuration } from '@/lib/format';
import { TurnSummary } from './TurnSummary';

/**
 * Renders a whole-message bubble — a user prompt or the end-of-turn result
 * footer. Assistant/tool content (text, thinking, tool runs) is flattened and
 * rendered by `ChatView` via `groupChatItems`, so this only handles the two
 * roles that stay message-scoped.
 */
export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === ChatMessageRole.User) {
    const text = message.blocks
      .map((b) => (b.type === ChatBlockType.Text ? b.text : ''))
      .join('')
      .trim();
    if (!text) return null;
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg border border-border bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-neutral-100">
          {text}
        </div>
      </div>
    );
  }

  if (message.role === ChatMessageRole.Result) {
    const meta = message.meta;
    // A failed run's error text is suppressed upstream; the footer stays muted
    // and shows only the useful summary (timing · turns · changed files).
    return (
      <div className="text-xs text-muted-foreground">
        <span>
          {meta?.durationMs != null ? formatDuration(meta.durationMs) : null}
          {meta?.durationMs != null && meta?.numTurns != null ? ' · ' : null}
          {meta?.numTurns != null
            ? `${meta.numTurns} ${meta.numTurns === 1 ? 'turn' : 'turns'}`
            : null}
        </span>
        {meta?.fileChanges?.length ? <TurnSummary meta={meta} /> : null}
      </div>
    );
  }

  return null;
}
