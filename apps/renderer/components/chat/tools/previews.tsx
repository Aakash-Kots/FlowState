'use client';

import type { ReactNode } from 'react';
import { highlightToHtml } from '@/lib/highlight';
import type { TodoItem } from '@/lib/types/toolInput';
import { DiffView } from '../../git/DiffView';
import { cn } from '../../ui/cn';

///////////////
// Constants //
///////////////

// Hover previews are a glance, not a full reader — cap the rendered text so a
// huge file/result can't build a massive DOM inside the card.
const PREVIEW_LIMIT = 8000;

/////////////
// Helpers //
/////////////

function clamp(text: string): string {
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT)}\n… (truncated)` : text;
}

///////////////////
// Sub-components //
///////////////////

/** Scroll frame shared by every preview — fixed width, capped height, code
 * background (dropped for plain-text previews). */
function PreviewFrame({ children, code = true }: { children: ReactNode; code?: boolean }) {
  return (
    <div
      className="max-h-[26rem] w-[34rem] max-w-[calc(100vw-2rem)] overflow-auto"
      style={code ? { backgroundColor: 'var(--code-bg)' } : undefined}
    >
      {children}
    </div>
  );
}

////////////
// Exports //
////////////

/** A muted one-liner preview (pending/empty states). */
export function TextPreview({ children }: { children: ReactNode }) {
  return (
    <div className="w-[22rem] max-w-[calc(100vw-2rem)] px-3 py-2 text-xs text-muted-foreground">
      {children}
    </div>
  );
}

/** Syntax-highlighted (or plain, when `lang` is null) code/text block. */
export function CodePreview({ code, lang }: { code: string; lang: string | null }) {
  if (!code.trim()) return <TextPreview>(empty)</TextPreview>;
  const text = clamp(code);
  const html = highlightToHtml(text, lang);
  return (
    <PreviewFrame>
      <pre
        className="code-hl whitespace-pre px-3 py-2 font-mono text-xs leading-5"
        style={{ color: 'var(--code-fg)' }}
      >
        {html !== null ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{text}</code>}
      </pre>
    </PreviewFrame>
  );
}

/** A unified-diff preview (Edit/MultiEdit), reusing the Git `DiffView`. */
export function DiffPreview({ patch, lang }: { patch: string; lang: string | null }) {
  if (!patch.trim()) return <TextPreview>No changes.</TextPreview>;
  return (
    <PreviewFrame>
      <DiffView patch={clamp(patch)} lang={lang} wrap={false} />
    </PreviewFrame>
  );
}

/** A TodoWrite list preview — status glyph + text, completed struck through. */
export function TodoPreview({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) return <TextPreview>No todos.</TextPreview>;
  return (
    <div className="w-[26rem] max-w-[calc(100vw-2rem)] space-y-1 px-3 py-2 text-xs">
      {todos.map((t, i) => {
        const done = t.status === 'completed';
        const active = t.status === 'in_progress';
        const glyph = done ? '✓' : active ? '◐' : '○';
        return (
          <div key={i} className="flex items-start gap-2">
            <span
              className={cn(
                'shrink-0',
                done ? 'text-success' : active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {glyph}
            </span>
            <span
              className={cn(
                done && 'text-muted-foreground line-through',
                active && 'text-neutral-100',
                !done && !active && 'text-neutral-300',
              )}
            >
              {active && t.activeForm ? t.activeForm : t.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}
