'use client';

import { memo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  ChatBlockType,
  ChatMessageRole,
  type ChatBlock,
  type ChatMessage,
} from '@flowstate/shared';
import { formatDuration } from '@/lib/format';
import { ImagePill } from './ImagePill';
import { TurnSummary } from './TurnSummary';

/////////////
// Helpers //
/////////////

/** One rendered run of a user prompt: plain text or a file `@mention`. */
type PromptSegment = { text: string } | { mention: string };

/**
 * Matches an `@mention` anywhere in the prompt: an `@` at the start or after
 * whitespace, then the space-free path. Mirrors the composer's insertion grammar
 * (`ComposerEditor` serializes each chosen file chip to `@<fullpath>`), so what
 * the composer emits is exactly what we re-pill here. The leading boundary char
 * is captured in group 1 to keep it in the surrounding text (never eaten).
 */
const MENTION_RE = /(^|\s)@([^\s@]+)/g;

/**
 * Split a sent user prompt into ordered text/mention segments so the bubble can
 * render each `@path` as a `FileRef` chip while preserving every other character
 * verbatim (whitespace/newlines matter under `whitespace-pre-wrap`).
 */
function splitPromptMentions(text: string): PromptSegment[] {
  const segments: PromptSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const [, boundary, path] = m;
    const start = m.index + boundary.length;
    if (start > last) segments.push({ text: text.slice(last, start) });
    segments.push({ mention: path });
    last = start + 1 + path.length; // skip the `@` + the path
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

/**
 * Renders a whole-message bubble — a user prompt or the end-of-turn result
 * footer. Assistant/tool content (text, thinking, tool runs) is flattened and
 * rendered by `ChatView` via `groupChatItems`, so this only handles the two
 * roles that stay message-scoped.
 */
export const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  if (message.role === ChatMessageRole.User) {
    const text = message.blocks
      .map((b) => (b.type === ChatBlockType.Text ? b.text : ''))
      .join('')
      .trim();
    const imageBlocks = message.blocks.filter(
      (b): b is Extract<ChatBlock, { type: ChatBlockType.Image }> => b.type === ChatBlockType.Image,
    );
    if (!text && imageBlocks.length === 0) return null;
    const copy = () => {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    };
    return (
      <div className="group flex flex-col items-end gap-1">
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
          {text && (
            <div className="whitespace-pre-wrap">
              {splitPromptMentions(text).map((seg, i) =>
                'mention' in seg ? (
                  <span
                    key={i}
                    title={seg.mention}
                    className="mx-0.5 inline-flex items-center rounded bg-primary/15 px-1 align-baseline text-primary"
                  >
                    @{seg.mention.split('/').pop() ?? seg.mention}
                  </span>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </div>
          )}
        </div>
        {text && (
          <button
            type="button"
            onClick={copy}
            title="Copy message"
            className="inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-neutral-200 focus-visible:opacity-100 group-hover:opacity-100"
          >
            {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
          </button>
        )}
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
