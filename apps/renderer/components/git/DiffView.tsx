'use client';

import { memo, useMemo, useState } from 'react';
import { highlightToHtml } from '@/lib/highlight';
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

///////////////
// Constants //
///////////////

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

/**
 * Cap how many diff lines mount at once. A large file diff can be tens of
 * thousands of lines; rendering them all freezes the UI. Beyond this the rest
 * collapse behind a "show all" reveal. Small diffs (the common case, and every
 * chat tool preview) render whole.
 */
const MAX_RENDERED_LINES = 2000;

///////////////////
// Sub-components //
///////////////////

/** Fixed single-column line-number gutter with a left accent stripe, sticky so
 * it survives the horizontal scroll of an unwrapped diff. Deletions show the old
 * line number in red, adds/context the new number (adds in green, context muted). */
const Gutter = memo(function Gutter({
  no,
  kind,
  width,
}: {
  no: LineNo;
  kind: LineKind;
  width: number;
}) {
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
});

/** One diff line: hunk/meta headers stay plain; +/-/context get their code
 * portion syntax-highlighted while the leading marker keeps its diff color. A
 * fixed old|new line-number gutter precedes every line. */
const DiffLine = memo(function DiffLine({
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
});

////////////
// Export //
////////////

/**
 * Presentational renderer for a unified-diff `patch` string: a scrollable code
 * surface where each line's code portion is syntax-highlighted (Prism, language
 * given by `lang`) in the user's chosen code theme, layered over the diff
 * add/del tints, with a sticky old/new line-number gutter. Shared by the Git
 * diff panel and the chat Edit/MultiEdit tool previews.
 */
export function DiffView({
  patch,
  lang,
  wrap = true,
}: {
  patch: string;
  lang: string | null;
  /** Wrap long lines (default) or let them scroll horizontally. */
  wrap?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const lines = useMemo(() => (patch ? patch.split('\n') : []), [patch]);
  const lineNumbers = useMemo(() => computeLineNumbers(lines), [lines]);

  // Width (in ch) of each gutter column, sized to the largest line number.
  const gutterWidth = useMemo(() => {
    let max = 0;
    for (const n of lineNumbers) max = Math.max(max, n.old ?? 0, n.new ?? 0);
    return Math.max(2, String(max).length);
  }, [lineNumbers]);

  // Cap the mounted line count for a huge diff so it doesn't freeze on open; a
  // reveal renders the rest on demand.
  const clamped = !showAll && lines.length > MAX_RENDERED_LINES;
  const visibleCount = clamped ? MAX_RENDERED_LINES : lines.length;

  return (
    <>
      <pre
        className={cn(
          'code-hl font-mono text-xs leading-5',
          wrap ? 'w-full whitespace-pre-wrap break-words' : 'w-max min-w-full whitespace-pre',
        )}
      >
        {lines.slice(0, visibleCount).map((line, i) => (
          <DiffLine key={i} line={line} lang={lang} no={lineNumbers[i]} gutterWidth={gutterWidth} />
        ))}
      </pre>
      {clamped && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full border-t border-border bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          Showing {MAX_RENDERED_LINES.toLocaleString()} of {lines.length.toLocaleString()} lines —
          show all
        </button>
      )}
    </>
  );
}
