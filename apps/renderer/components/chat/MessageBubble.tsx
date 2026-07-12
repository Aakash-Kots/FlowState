'use client';

import { useState } from 'react';
import { ChatBlockType, ChatMessageRole, type ChatMessage } from '@flowstate/shared';
import type { ToolResultBlock } from '@/lib/types/chat';
import { cn } from '../ui/cn';
import { Markdown } from './Markdown';
import { ToolUseRow } from './ToolUseRow';

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs italic text-muted transition-colors hover:text-neutral-300"
      >
        {open ? '▾' : '▸'} Thinking
      </button>
      {open && (
        <p className="mt-1 whitespace-pre-wrap border-l-2 border-edge pl-3 text-xs italic leading-relaxed text-muted">
          {text}
        </p>
      )}
    </div>
  );
}

/**
 * Renders one persisted chat message. Tool results are looked up from the
 * whole conversation (they arrive as separate 'tool' messages) so a tool call
 * and its output render as a single collapsible row.
 */
export function MessageBubble({
  message,
  toolResults,
  toolUseIds,
}: {
  message: ChatMessage;
  toolResults: Map<string, ToolResultBlock>;
  /** Ids of every tool_use block in the conversation — a result whose call is known renders inside that call's row. */
  toolUseIds: Set<string>;
}) {
  if (message.role === ChatMessageRole.User) {
    const text = message.blocks
      .map((b) => (b.type === ChatBlockType.Text ? b.text : ''))
      .join('')
      .trim();
    if (!text) return null;
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg border border-edge bg-raised px-3.5 py-2.5 text-sm leading-relaxed text-neutral-100">
          {text}
        </div>
      </div>
    );
  }

  if (message.role === ChatMessageRole.Result) {
    const meta = message.meta;
    const errorText = message.blocks
      .map((b) => (b.type === ChatBlockType.Text ? b.text : ''))
      .join('')
      .trim();
    return (
      <div className={cn('text-xs', meta?.isError ? 'text-danger' : 'text-muted')}>
        {meta?.isError && errorText ? (
          <p className="mb-1 whitespace-pre-wrap">{errorText}</p>
        ) : null}
        <span>
          {meta?.costUsd != null ? `$${meta.costUsd.toFixed(4)}` : null}
          {meta?.durationMs != null ? ` · ${(meta.durationMs / 1000).toFixed(1)}s` : null}
          {meta?.numTurns != null
            ? ` · ${meta.numTurns} ${meta.numTurns === 1 ? 'turn' : 'turns'}`
            : null}
        </span>
      </div>
    );
  }

  // assistant / tool messages: render blocks in order.
  return (
    <div className="space-y-2">
      {message.blocks.map((block, i) => {
        switch (block.type) {
          case ChatBlockType.Text:
            return <Markdown key={i}>{block.text}</Markdown>;
          case ChatBlockType.Thinking:
            return <ThinkingBlock key={i} text={block.text} />;
          case ChatBlockType.ToolUse:
            return <ToolUseRow key={block.id} block={block} result={toolResults.get(block.id)} />;
          case ChatBlockType.ToolResult:
            // Rendered inline with its tool_use row; skip standalone output
            // unless the call is missing (defensive).
            return toolUseIds.has(block.toolUseId) ? null : (
              <pre
                key={i}
                className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-edge bg-raised p-2 font-mono text-xs text-neutral-300"
              >
                {block.content}
              </pre>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
