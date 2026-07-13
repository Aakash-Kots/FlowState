'use client';

import { useState } from 'react';
import type { ToolResultBlock, ToolUseBlock } from '@/lib/types/chat';
import { cn } from '../ui/cn';

function summarizeInput(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    // The most recognizable single field per common tool, else first string value.
    const preferred =
      obj.command ?? obj.file_path ?? obj.pattern ?? obj.query ?? obj.url ?? obj.description;
    const value = preferred ?? Object.values(obj).find((v) => typeof v === 'string');
    if (typeof value === 'string') return value.split('\n')[0] ?? '';
  }
  return String(input).split('\n')[0] ?? '';
}

const PREVIEW_LIMIT = 4000;

/**
 * Compact one-line summary of a tool call, expandable to the full input and
 * its paired result.
 */
export function ToolUseRow({ block, result }: { block: ToolUseBlock; result?: ToolResultBlock }) {
  const [open, setOpen] = useState(false);
  const summary = summarizeInput(block.input);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-secondary">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs',
          'text-muted-foreground transition-colors hover:bg-muted hover:text-neutral-200',
        )}
      >
        <span className={cn('shrink-0', result?.isError ? 'text-danger' : 'text-muted-foreground')}>
          ⚙
        </span>
        <span className="shrink-0 font-medium text-neutral-300">{block.name}</span>
        {summary && <span className="truncate">{summary}</span>}
        <span className="ml-auto shrink-0 text-[10px]">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
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
