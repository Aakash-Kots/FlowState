'use client';

import { useMemo, useState } from 'react';
import { WrapText } from 'lucide-react';
import { useGit } from '@/lib/git';
import { cn } from '../ui/cn';

///////////
// Types //
///////////

type LineKind = 'add' | 'del' | 'hunk' | 'meta' | 'context';

/////////////
// Helpers //
/////////////

/** Classify a unified-diff line for coloring. */
function classify(line: string): LineKind {
  if (line.startsWith('@@')) return 'hunk';
  if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('new file') ||
    line.startsWith('deleted file') ||
    line.startsWith('rename ') ||
    line.startsWith('similarity ') ||
    line.startsWith('old mode') ||
    line.startsWith('new mode')
  ) {
    return 'meta';
  }
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return 'context';
}

const LINE_CLASS: Record<LineKind, string> = {
  add: 'bg-success/10 text-success',
  del: 'bg-danger/10 text-danger',
  hunk: 'bg-muted text-muted-foreground',
  meta: 'text-muted-foreground/70',
  context: 'text-neutral-300',
};

///////////////////
// Sub-components //
///////////////////

/** Centered muted placeholder for the empty/binary states. */
function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * The right column: the selected file's unified diff, colored by line kind. Diff
 * text is rendered as-is (no syntax highlighting) in a monospaced, scrollable
 * pane. Hunk-level staging is out of scope for v1.
 */
export function DiffPanel() {
  const selected = useGit((s) => s.selected);
  const diff = useGit((s) => s.diff);
  const diffLoading = useGit((s) => s.diffLoading);
  // Wrap long lines by default (kills horizontal scroll for prose diffs); toggle
  // off for aligned, horizontally-scrolling code — same choice GitHub's diff offers.
  const [wrap, setWrap] = useState(true);

  const lines = useMemo(() => (diff?.patch ? diff.patch.split('\n') : []), [diff?.patch]);

  let body: React.ReactNode;
  if (!selected) {
    body = <Placeholder>Select a file to view its diff</Placeholder>;
  } else if (diffLoading && !diff) {
    body = <Placeholder>Loading diff…</Placeholder>;
  } else if (diff?.binary) {
    body = <Placeholder>Binary file — no preview.</Placeholder>;
  } else if (lines.length === 0) {
    body = <Placeholder>No textual changes.</Placeholder>;
  } else {
    body = (
      <div className="min-h-0 flex-1 overflow-auto">
        <pre
          className={cn(
            'font-mono text-xs leading-5',
            wrap ? 'w-full whitespace-pre-wrap break-words' : 'w-max min-w-full whitespace-pre',
          )}
        >
          {lines.map((line, i) => {
            const kind = classify(line);
            return (
              <div key={i} className={cn('px-3', LINE_CLASS[kind])}>
                {line === '' ? ' ' : line}
              </div>
            );
          })}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {selected && (
        <div className="flex items-center border-b border-border px-3 py-1.5">
          <span className="min-w-0 truncate font-mono text-xs text-neutral-200" title={selected.path}>
            {selected.path}
          </span>
          <span className="ml-2 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {selected.staged ? 'staged' : 'unstaged'}
          </span>
          <button
            type="button"
            onClick={() => setWrap((w) => !w)}
            title={wrap ? 'Disable line wrap' : 'Wrap long lines'}
            aria-pressed={wrap}
            className={cn(
              'ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted',
              wrap ? 'text-neutral-200' : 'text-muted-foreground',
            )}
          >
            <WrapText className="size-3.5" />
          </button>
        </div>
      )}
      {body}
    </div>
  );
}
