'use client';

import { useMemo, useState } from 'react';
import { WrapText } from 'lucide-react';
import { useGit } from '@/lib/git';
import { langForPath } from '@/lib/highlight';
import { cn } from '../ui/cn';
import { DiffView } from './DiffView';

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

////////////
// Export //
////////////

/**
 * The right column: the selected file's unified diff, rendered by the shared
 * `DiffView` (Prism-highlighted, language inferred from the file extension) with
 * a header and a line-wrap toggle. Hunk-level staging is out of scope for v1.
 */
export function DiffPanel() {
  const selected = useGit((s) => s.selected);
  const diff = useGit((s) => s.diff);
  const diffLoading = useGit((s) => s.diffLoading);
  // Wrap long lines by default (kills horizontal scroll for prose diffs); toggle
  // off for aligned, horizontally-scrolling code — same choice GitHub's diff offers.
  const [wrap, setWrap] = useState(true);

  const lang = useMemo(() => (selected ? langForPath(selected.path) : null), [selected]);

  let body: React.ReactNode;
  if (!selected) {
    body = <Placeholder>Select a file to view its diff</Placeholder>;
  } else if (diffLoading && !diff) {
    body = <Placeholder>Loading diff…</Placeholder>;
  } else if (diff?.binary) {
    body = <Placeholder>Binary file — no preview.</Placeholder>;
  } else if (!diff?.patch) {
    body = <Placeholder>No textual changes.</Placeholder>;
  } else {
    body = (
      <div className="min-h-0 flex-1 overflow-auto" style={{ backgroundColor: 'var(--code-bg)' }}>
        <DiffView
          key={`${selected.path}:${selected.staged}`}
          patch={diff.patch}
          lang={lang}
          wrap={wrap}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {selected && (
        <div className="flex items-center border-b border-border px-3 py-1.5">
          <span
            className="min-w-0 truncate font-mono text-xs text-neutral-200"
            title={selected.path}
          >
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
