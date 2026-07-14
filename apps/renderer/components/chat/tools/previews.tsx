'use client';

import type { ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';
import { highlightToHtml } from '@/lib/highlight';
import type { TodoItem } from '@/lib/types/toolInput';
import { DiffView } from '../../git/DiffView';
import { cn } from '../../ui/cn';
import { Markdown } from '../Markdown';

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

/** Scroll frame shared by every preview — capped height, code background
 * (dropped for plain-text previews). Fixed-width for the transcript hover cards;
 * `fluid` fills its container instead (used inline in the permission prompt). */
function PreviewFrame({
  children,
  code = true,
  fluid = false,
}: {
  children: ReactNode;
  code?: boolean;
  fluid?: boolean;
}) {
  return (
    <div
      className={cn(
        'max-h-[20rem] max-w-[calc(100vw-2rem)] overflow-auto',
        fluid ? 'w-full' : 'w-[28rem]',
      )}
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
export function CodePreview({
  code,
  lang,
  fluid = false,
}: {
  code: string;
  lang: string | null;
  fluid?: boolean;
}) {
  if (!code.trim()) return <TextPreview>(empty)</TextPreview>;
  const text = clamp(code);
  const html = highlightToHtml(text, lang);
  return (
    <PreviewFrame fluid={fluid}>
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
export function DiffPreview({
  patch,
  lang,
  fluid = false,
}: {
  patch: string;
  lang: string | null;
  fluid?: boolean;
}) {
  if (!patch.trim()) return <TextPreview>No changes.</TextPreview>;
  return (
    <PreviewFrame fluid={fluid}>
      <DiffView patch={clamp(patch)} lang={lang} wrap={false} />
    </PreviewFrame>
  );
}

/** An ExitPlanMode preview — the plan markdown rendered as a formatted plan.
 * Wider/taller than the code previews since a plan is a document, not a glance. */
export function PlanPreview({ plan }: { plan: string }) {
  if (!plan.trim()) return <TextPreview>Empty plan.</TextPreview>;
  return (
    <div className="max-h-[32rem] w-[40rem] max-w-[calc(100vw-2rem)] overflow-auto px-4 py-3">
      <Markdown>{clamp(plan)}</Markdown>
    </div>
  );
}

/** The proposed plan rendered inline in the message stream as an "opened
 * document" — full-width, with a file-style header — while it awaits the user's
 * decision. Unlike {@link PlanPreview} (a fixed-width hover-card glance) this is
 * the primary reading surface, so it fills the bubble and doesn't clamp. */
export function PlanDocument({ plan }: { plan: string }) {
  if (!plan.trim()) {
    return (
      <div className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
        Empty plan.
      </div>
    );
  }
  return (
    <div className="w-full overflow-hidden rounded-lg border border-amber-300/30 bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/40 px-3 py-1.5 font-mono text-xs">
        <ClipboardList className="size-3.5 text-amber-300" />
        <span className="font-medium text-amber-300">Plan</span>
      </div>
      <div className="max-h-[32rem] overflow-auto px-4 py-3">
        <Markdown>{plan}</Markdown>
      </div>
    </div>
  );
}

/** A TodoWrite list preview — status glyph + text, completed struck through. */
export function TodoPreview({ todos, fluid = false }: { todos: TodoItem[]; fluid?: boolean }) {
  if (todos.length === 0) return <TextPreview>No todos.</TextPreview>;
  return (
    <div
      className={cn(
        'max-w-[calc(100vw-2rem)] space-y-1 px-3 py-2 text-xs',
        fluid ? 'w-full' : 'w-[26rem]',
      )}
    >
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
