'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileImage, X } from 'lucide-react';

// Hover-intent delay before the preview opens, so brushing past a pill while
// typing/scrolling doesn't flash the image.
const HOVER_DELAY_MS = 450;

/**
 * A pasted/uploaded image rendered as a compact inline chip — a green image
 * glyph next to its filename — that reveals the full image in a hover popover.
 * Keeps the composer and message bubbles tidy instead of inlining a large
 * thumbnail. Pass `onRemove` to show a delete affordance (the composer's draft
 * attachments); the sent bubble omits it.
 *
 * The preview is portaled to `document.body` and positioned from the pill's
 * viewport rect so it can escape the composer's scroll/overflow clipping.
 */
export function ImagePill({
  name,
  mediaType,
  data,
  onRemove,
}: {
  name: string;
  mediaType: string;
  data: string;
  onRemove?: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  // Drives the enter/exit transition: mount at `shown=false` (faded/scaled down),
  // flip to `true` next frame to ease in, and back to `false` on leave — the
  // element unmounts only once the fade-out transition finishes.
  const [shown, setShown] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const src = `data:${mediaType};base64,${data}`;

  useLayoutEffect(() => {
    if (!rect) return;
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [rect]);

  // Never leave a pending open timer running past unmount.
  useEffect(() => () => clearTimeout(openTimer.current ?? undefined), []);

  const scheduleOpen = (el: HTMLElement) => {
    clearTimeout(openTimer.current ?? undefined);
    openTimer.current = setTimeout(() => setRect(el.getBoundingClientRect()), HOVER_DELAY_MS);
  };

  const cancel = () => {
    clearTimeout(openTimer.current ?? undefined);
    openTimer.current = null;
    setShown(false);
  };

  return (
    <span
      className="inline-flex max-w-[12rem] select-none items-center gap-1.5 rounded-md border border-border bg-secondary py-0.5 pl-1.5 pr-1 align-middle text-xs"
      title={name}
      onMouseEnter={(e) => scheduleOpen(e.currentTarget)}
      onMouseLeave={cancel}
    >
      <FileImage className="size-3.5 shrink-0 text-green-500" />
      <span className="min-w-0 truncate text-neutral-200">{name}</span>
      {onRemove && (
        <button
          type="button"
          // Don't let the mousedown move the contentEditable caret / blur the editor.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onRemove}
          title="Remove image"
          className="ml-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-neutral-100"
        >
          <X className="size-3" />
        </button>
      )}
      {rect &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50"
            style={{
              left: rect.left,
              top: rect.top - 8,
              opacity: shown ? 1 : 0,
              transform: `translateY(-100%) scale(${shown ? 1 : 0.96})`,
              transformOrigin: 'bottom left',
              transition: 'opacity 140ms ease-out, transform 140ms ease-out',
            }}
            // Unmount only after the fade-out lands, so the exit animates too.
            onTransitionEnd={() => {
              if (!shown) setRect(null);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={name}
              className="max-h-64 max-w-xs rounded-md border border-border object-contain shadow-lg shadow-black/40"
            />
          </div>,
          document.body,
        )}
    </span>
  );
}
