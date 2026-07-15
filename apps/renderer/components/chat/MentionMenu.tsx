'use client';

import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileCode, Loader2 } from 'lucide-react';
import type { MentionCaret } from '@/lib/types/chat';
import { cn } from '../ui/cn';

///////////////
// Constants //
///////////////

const MENU_WIDTH = 320;
const MAX_HEIGHT = 288;
const GAP = 6;
const MARGIN = 8;

/////////////
// Helpers //
/////////////

/** Split a repo-relative path into its filename and its parent directory. */
function splitPath(path: string): { name: string; dir: string } {
  const slash = path.lastIndexOf('/');
  return slash === -1
    ? { name: path, dir: '' }
    : { name: path.slice(slash + 1), dir: path.slice(0, slash) };
}

/**
 * Place the menu next to the caret: below it by default, flipped above when
 * there's more room there, clamped to the viewport. Fixed positioning keeps it
 * out of any `overflow-hidden` ancestor (e.g. the create-worktree modal).
 */
function positionFor(caret: MentionCaret): { style: React.CSSProperties; listMaxHeight: number } {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const spaceBelow = vh - caret.bottom;
  const spaceAbove = caret.top;
  const openUp = spaceBelow < Math.min(MAX_HEIGHT, 220) && spaceAbove > spaceBelow;
  const left = Math.max(MARGIN, Math.min(caret.left, vw - MENU_WIDTH - MARGIN));
  const listMaxHeight = Math.max(
    120,
    Math.min(MAX_HEIGHT, (openUp ? spaceAbove : spaceBelow) - GAP - MARGIN),
  );
  const style: React.CSSProperties = {
    position: 'fixed',
    left,
    width: MENU_WIDTH,
    zIndex: 100,
    ...(openUp ? { bottom: vh - caret.top + GAP } : { top: caret.bottom + GAP }),
  };
  return { style, listMaxHeight };
}

////////////
// Export //
////////////

/**
 * The `@`-triggered file autocomplete, anchored to the caret. A sibling of
 * `SlashMenu`: purely presentational — the editor owns the query, the
 * highlighted index, and all keyboard handling; this renders the filtered file
 * list (or a loading state) and reports clicks/hovers back up. Rows use
 * `onMouseDown` + `preventDefault` so picking one doesn't blur the editor and
 * dismiss the menu before the selection registers.
 */
export function MentionMenu({
  files,
  activeIndex,
  loading,
  caret,
  onSelect,
  onHover,
}: {
  files: string[];
  activeIndex: number;
  loading?: boolean;
  caret: MentionCaret;
  onSelect: (path: string) => void;
  onHover: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const { style, listMaxHeight } = useMemo(() => positionFor(caret), [caret]);

  // Keep the highlighted row scrolled into view as the user arrows through.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Portalled to the body so the fixed positioning is viewport-relative and
  // isn't clipped by (or offset from) a transformed/overflow-hidden ancestor —
  // e.g. the create-worktree modal, whose panel is centered with a transform.
  return createPortal(
    // Stop pointer/mouse-down from reaching the document so a Radix Dialog
    // ancestor (the create-worktree modal) doesn't treat picking a file as an
    // "interact outside" and dismiss itself.
    <div
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={listRef}
        style={{ maxHeight: listMaxHeight }}
        className="overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
      >
        <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Files
        </div>
        {loading && (
          <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading files…
          </div>
        )}
        {!loading && files.length === 0 && (
          <div className="px-2.5 py-2 text-xs text-muted-foreground">No matching files</div>
        )}
        {files.map((path, index) => {
          const { name, dir } = splitPath(path);
          return (
            <button
              key={path}
              type="button"
              data-index={index}
              title={path}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(path);
              }}
              onMouseEnter={() => onHover(index)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                index === activeIndex ? 'bg-accent' : 'hover:bg-accent/60',
              )}
            >
              <FileCode className="size-3.5 shrink-0 text-muted-foreground" />
              {/* The filename keeps its space; the directory yields first
                  (shrinks ~8× faster) and elides from the left so its tail —
                  the part nearest the file — stays readable. Full path on hover. */}
              <span className="min-w-0 truncate text-popover-foreground">{name}</span>
              {dir && (
                <span
                  dir="rtl"
                  style={{ flexShrink: 8 }}
                  className="ml-auto min-w-0 truncate pl-2 text-[11px] text-muted-foreground"
                >
                  {dir}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
