'use client';

import { useMemo, useState } from 'react';
import { WrapText } from 'lucide-react';
import { useGit } from '@/lib/git';
import { highlightToHtml, langForPath } from '@/lib/highlight';
import { cn } from '../ui/cn';

///////////
// Types //
///////////

type LineKind = 'add' | 'del' | 'hunk' | 'meta' | 'context';

/** Old/new file line numbers for a single diff line (null where absent). */
type LineNo = { old: number | null; new: number | null };

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
    line.startsWith('new mode') ||
    line.startsWith('\\ ')
  ) {
    return 'meta';
  }
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return 'context';
}

/**
 * Walk the unified diff and assign each line its old/new file line numbers,
 * seeded from each `@@ -old,… +new,… @@` hunk header. Adds only advance the new
 * counter, dels only the old, context both; headers get no numbers.
 */
function computeLineNumbers(lines: string[]): LineNo[] {
  let oldNo = 0;
  let newNo = 0;
  return lines.map((line) => {
    const kind = classify(line);
    if (kind === 'hunk') {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (m) {
        oldNo = Number(m[1]);
        newNo = Number(m[2]);
      }
      return { old: null, new: null };
    }
    if (kind === 'meta') return { old: null, new: null };
    if (kind === 'add') return { old: null, new: newNo++ };
    if (kind === 'del') return { old: oldNo++, new: null };
    return { old: oldNo++, new: newNo++ };
  });
}

// Per-kind line background + marker color, driven by the active code theme's vars.
const LINE_BG: Partial<Record<LineKind, string>> = {
  add: 'var(--code-add-bg)',
  del: 'var(--code-del-bg)',
  hunk: 'var(--code-hunk-bg)',
};

const MARKER_COLOR: Partial<Record<LineKind, string>> = {
  add: 'var(--code-add-fg)',
  del: 'var(--code-del-fg)',
};

// Line-number + left accent-stripe color for add/del rows; context stays muted.
const NUM_COLOR: Partial<Record<LineKind, string>> = {
  add: 'var(--code-add-fg)',
  del: 'var(--code-del-fg)',
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

/** Fixed single-column line-number gutter with a left accent stripe, sticky so
 * it survives the horizontal scroll of an unwrapped diff. Deletions show the old
 * line number in red, adds/context the new number (adds in green, context muted). */
function Gutter({ no, kind, width }: { no: LineNo; kind: LineKind; width: number }) {
  const num = kind === 'del' ? no.old : no.new;
  const accent = NUM_COLOR[kind];
  return (
    <span
      className="sticky left-0 z-10 flex shrink-0 select-none self-stretch border-r border-border"
      style={{ backgroundColor: 'var(--code-bg)' }}
      aria-hidden
    >
      <span className="w-[3px] self-stretch" style={{ backgroundColor: accent ?? 'transparent' }} />
      <span
        className="whitespace-nowrap px-2 text-right tabular-nums"
        style={{
          minWidth: `calc(${width}ch + 0.5rem)`,
          color: accent ?? 'var(--code-meta-fg)',
          opacity: accent ? 0.9 : 0.5,
        }}
      >
        {num ?? ''}
      </span>
    </span>
  );
}

/** One diff line: hunk/meta headers stay plain; +/-/context get their code
 * portion syntax-highlighted while the leading marker keeps its diff color. A
 * fixed old|new line-number gutter precedes every line. */
function DiffLine({
  line,
  lang,
  no,
  gutterWidth,
}: {
  line: string;
  lang: string | null;
  no: LineNo;
  gutterWidth: number;
}) {
  const kind = classify(line);

  if (kind === 'hunk' || kind === 'meta') {
    return (
      <div className="flex" style={{ backgroundColor: LINE_BG[kind] }}>
        <Gutter no={no} kind={kind} width={gutterWidth} />
        <span
          className="min-w-0 flex-1 px-3"
          style={{ color: kind === 'hunk' ? 'var(--code-hunk-fg)' : 'var(--code-meta-fg)' }}
        >
          {line === '' ? ' ' : line}
        </span>
      </div>
    );
  }

  // Marker (+/-/space) is column 1 of the diff; the rest is the actual code.
  const marker = line.slice(0, 1);
  const code = line.slice(1);
  const html = highlightToHtml(code, lang);

  return (
    <div className="flex" style={{ backgroundColor: LINE_BG[kind] }}>
      <Gutter no={no} kind={kind} width={gutterWidth} />
      <span className="min-w-0 flex-1 px-3">
        <span style={{ color: MARKER_COLOR[kind] ?? 'var(--code-meta-fg)' }}>{marker || ' '}</span>
        {html !== null ? (
          <span dangerouslySetInnerHTML={{ __html: code === '' ? ' ' : html }} />
        ) : (
          <span>{code === '' ? ' ' : code}</span>
        )}
      </span>
    </div>
  );
}

/**
 * The right column: the selected file's unified diff. The code portion of each
 * line is syntax-highlighted (Prism, language inferred from the file extension)
 * in the user's chosen code theme, layered over the diff add/del tints. Hunk-
 * level staging is out of scope for v1.
 */
export function DiffPanel() {
  const selected = useGit((s) => s.selected);
  const diff = useGit((s) => s.diff);
  const diffLoading = useGit((s) => s.diffLoading);
  // Wrap long lines by default (kills horizontal scroll for prose diffs); toggle
  // off for aligned, horizontally-scrolling code — same choice GitHub's diff offers.
  const [wrap, setWrap] = useState(true);

  const lines = useMemo(() => (diff?.patch ? diff.patch.split('\n') : []), [diff?.patch]);
  const lineNumbers = useMemo(() => computeLineNumbers(lines), [lines]);
  const lang = useMemo(() => (selected ? langForPath(selected.path) : null), [selected]);

  // Width (in ch) of each gutter column, sized to the largest line number.
  const gutterWidth = useMemo(() => {
    let max = 0;
    for (const n of lineNumbers) max = Math.max(max, n.old ?? 0, n.new ?? 0);
    return Math.max(2, String(max).length);
  }, [lineNumbers]);

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
      <div className="min-h-0 flex-1 overflow-auto" style={{ backgroundColor: 'var(--code-bg)' }}>
        <pre
          className={cn(
            'code-hl font-mono text-xs leading-5',
            wrap ? 'w-full whitespace-pre-wrap break-words' : 'w-max min-w-full whitespace-pre',
          )}
        >
          {lines.map((line, i) => (
            <DiffLine
              key={i}
              line={line}
              lang={lang}
              no={lineNumbers[i]}
              gutterWidth={gutterWidth}
            />
          ))}
        </pre>
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
