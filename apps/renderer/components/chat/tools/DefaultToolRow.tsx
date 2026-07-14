'use client';

import { useState } from 'react';
import { colorForTool } from '@/lib/constants/tools';
import type { ToolRowProps } from '@/lib/types/chat';
import { cn } from '../../ui/cn';

///////////////
// Constants //
///////////////

const PREVIEW_LIMIT = 4000;

/////////////
// Helpers //
/////////////

/** First recognizable field of an unknown tool input, for the collapsed line. */
function summarizeInput(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const preferred =
      obj.command ?? obj.file_path ?? obj.pattern ?? obj.query ?? obj.url ?? obj.description;
    const value = preferred ?? Object.values(obj).find((v) => typeof v === 'string');
    if (typeof value === 'string') return value.split('\n')[0] ?? '';
  }
  return String(input).split('\n')[0] ?? '';
}

////////////
// Export //
////////////

/**
 * Fallback row for tools without bespoke rendering (and for inputs that fail
 * their schema): a collapsible one-liner expanding to the raw JSON input and the
 * paired result — the app's original tool-call presentation.
 */
export function DefaultToolRow({ block, result }: ToolRowProps) {
  const [open, setOpen] = useState(false);
  const summary = summarizeInput(block.input);

  return (
    <div className="font-mono text-[11px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 text-left',
          'text-muted-foreground transition-colors hover:text-neutral-200',
        )}
      >
        <span className={cn('shrink-0', result?.isError ? 'text-danger' : 'text-muted-foreground')}>
          ⚙
        </span>
        <span className={cn('shrink-0 font-medium', colorForTool(block.name))}>{block.name}</span>
        {summary && <span className="truncate">{summary}</span>}
        <span className="ml-auto shrink-0 text-[10px]">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-2 border-l-2 border-border pl-3">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs text-neutral-300">
            {JSON.stringify(block.input, null, 2)}
          </pre>
          {result && (
            <pre
              className={cn(
                'max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted p-2 font-mono text-xs',
                result.isError ? 'text-danger' : 'text-neutral-300',
              )}
            >
              {result.content.length > PREVIEW_LIMIT
                ? `${result.content.slice(0, PREVIEW_LIMIT)}\n… (truncated)`
                : result.content || '(no output)'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
