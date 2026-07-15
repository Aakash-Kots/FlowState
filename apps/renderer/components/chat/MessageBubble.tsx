'use client';

import { memo } from 'react';
import {
  ChatBlockType,
  ChatMessageRole,
  type ChatBlock,
  type ChatMessage,
} from '@flowstate/shared';
import { formatDuration } from '@/lib/format';
import { ImagePill } from './ImagePill';
import { TurnSummary } from './TurnSummary';

/**
 * Renders a whole-message bubble — a user prompt or the end-of-turn result
 * footer. Assistant/tool content (text, thinking, tool runs) is flattened and
 * rendered by `ChatView` via `groupChatItems`, so this only handles the two
 * roles that stay message-scoped.
 */
export const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === ChatMessageRole.User) {
    const text = message.blocks
      .map((b) => (b.type === ChatBlockType.Text ? b.text : ''))
      .join('')
      .trim();
    const imageBlocks = message.blocks.filter(
      (b): b is Extract<ChatBlock, { type: ChatBlockType.Image }> => b.type === ChatBlockType.Image,
    );
    if (!text && imageBlocks.length === 0) return null;
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col gap-2 rounded-lg border border-border bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-neutral-100">
          {imageBlocks.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {imageBlocks.map((b, i) => (
                <ImagePill
                  key={i}
                  name={b.name ?? `image.${b.mediaType.split('/')[1] ?? 'png'}`}
                  mediaType={b.mediaType}
                  data={b.data}
                />
              ))}
            </div>
          )}
          {text && <div className="whitespace-pre-wrap">{text}</div>}
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
});
