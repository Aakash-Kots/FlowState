'use client';

import {
  forwardRef,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { ChatImageInput } from '@flowstate/shared';
import { fileToChatImage } from '@/lib/chat';
import { MAX_COMPOSER_IMAGES, MAX_COMPOSER_IMAGE_BYTES } from '@/lib/constants/chat';
import { fuzzyScorePath } from '@/lib/search';
import type { ComposerDraft, MentionCaret } from '@/lib/types/chat';
import { cn } from '../ui/cn';
import { ImagePill } from './ImagePill';
import { MentionMenu } from './MentionMenu';

///////////
// Types //
///////////

/**
 * Enables the `@` file-mention menu. `fetch` returns the candidate paths (called
 * fresh each time the menu opens, mirroring the ⌘P finder), which the editor
 * filters by the typed query.
 */
export type MentionConfig = { fetch: () => Promise<string[]> };

/** Imperative API the InputBar drives the rich editor through. */
export type ComposerEditorHandle = {
  focus: () => void;
  clear: () => void;
  /** Replace all content with plain text (drops images), caret at the end. */
  setText: (text: string) => void;
  /** Replace all content with a saved draft (text + image pills), caret at the end. */
  setDraft: (draft: ComposerDraft) => void;
  /** Insert image pills at the caret (or the end when unfocused). */
  insertImages: (images: ChatImageInput[]) => void;
  getDraft: () => ComposerDraft;
};

/** A live image pill mounted into the editor via a portal onto its host span. */
type Pill = { id: string; node: HTMLSpanElement; image: ChatImageInput };

/** Where an in-progress `@mention` sits in the DOM, so it can be replaced. */
type MentionAnchor = { node: Text; atIndex: number; queryLen: number };

///////////////
// Constants //
///////////////

/**
 * Matches an in-progress `@mention` at the caret: an `@` at the start of the
 * text-or-after-whitespace, followed by the (space-free) query typed so far.
 */
const MENTION_RE = /(?:^|\s)@([^\s@]*)$/;

/** Cap the file menu so huge repos don't render thousands of rows. */
const MAX_MENTION_RESULTS = 50;

/////////////
// Helpers //
/////////////

/** Build the atomic, non-editable chip inserted for a chosen file mention. */
function createMentionChip(path: string): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.dataset.mention = path;
  chip.contentEditable = 'false';
  chip.title = path;
  chip.textContent = `@${path.split('/').pop() ?? path}`;
  chip.className =
    'mx-0.5 inline-flex items-center rounded bg-primary/15 px-1 align-baseline text-primary';
  return chip;
}

/**
 * Rank candidate paths against the query with the shared fuzzy scorer (filename
 * matches outrank directory-only ones), best-first, capped. An empty query keeps
 * the server's alphabetical order. `sort` is stable, so equal-score results keep
 * that incoming alphabetical order as a natural tiebreak.
 */
function filterMentions(files: string[], query: string): string[] {
  if (!query) return files.slice(0, MAX_MENTION_RESULTS);
  return files
    .map((path) => ({ path, score: fuzzyScorePath(path, query) }))
    .filter((m) => m.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MENTION_RESULTS)
    .map((m) => m.path);
}

/** Skip unsupported types / oversized files, then decode to base64 attachments. */
async function filesToImages(files: File[]): Promise<ChatImageInput[]> {
  const usable = files.filter(
    (f) => f.type.startsWith('image/') && f.size <= MAX_COMPOSER_IMAGE_BYTES,
  );
  const converted = await Promise.all(usable.map(fileToChatImage));
  return converted.filter((img): img is ChatImageInput => img !== null);
}

////////////
// Export //
////////////

/**
 * A plain-text-plus-image-pills editor built on `contentEditable`. Text is owned
 * by the browser (uncontrolled); image pills are `contenteditable="false"` host
 * spans that React fills via portals, so they behave as atomic inline units the
 * caret steps over and backspace deletes whole. `onChange` reports the serialized
 * draft on every user edit; `setText`/`clear` mutate imperatively without firing
 * it (the InputBar tracks the mirrored plain text itself).
 */
export const ComposerEditor = forwardRef<
  ComposerEditorHandle,
  {
    disabled: boolean;
    placeholder: string;
    onChange: (draft: ComposerDraft) => void;
    onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
    /** Allow image paste/insertion (default true). The worktree modal turns this off. */
    allowImages?: boolean;
    /** When set, enables the `@` file-mention menu. */
    mentions?: MentionConfig;
    /** Extra classes for the editable surface (e.g. a taller min-height). */
    editorClassName?: string;
  }
>(function ComposerEditor(
  { disabled, placeholder, onChange, onKeyDown, allowImages = true, mentions, editorClassName },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<Map<string, ChatImageInput>>(new Map());
  const idRef = useRef(0);
  const savedRangeRef = useRef<Range | null>(null);
  const [pills, setPills] = useState<Pill[]>([]);
  const [empty, setEmpty] = useState(true);

  // The `@` file-mention menu. `query` is the text typed after `@` (null = the
  // menu is closed); the anchor lets us splice the chosen path back in over it.
  // Files are (re)fetched on each open and cached in `mentionFiles`.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionCaret, setMentionCaret] = useState<MentionCaret | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionFiles, setMentionFiles] = useState<string[] | null>(null);
  const [mentionLoading, setMentionLoading] = useState(false);
  const mentionAnchorRef = useRef<MentionAnchor | null>(null);
  const mentionOpenRef = useRef(false);
  const mentionDismissedRef = useRef(false);
  const mentionFetchingRef = useRef(false);

  // Walk the editor DOM in document order, accumulating text and images so an
  // inline pill contributes to the draft exactly where it sits amid the text.
  const serialize = (): ComposerDraft => {
    const root = editorRef.current;
    if (!root) return { text: '', images: [] };
    let text = '';
    const images: ChatImageInput[] = [];
    const walk = (node: Node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          text += child.textContent ?? '';
          return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        const el = child as HTMLElement;
        const imgId = el.dataset?.imgId;
        if (imgId) {
          const img = imagesRef.current.get(imgId);
          if (img) images.push(img);
          return; // atomic — never descend into the portal's pill markup
        }
        const mentionPath = el.dataset?.mention;
        if (mentionPath) {
          // A file chip contributes its real `@path` reference to the prompt.
          text += `@${mentionPath}`;
          return; // atomic — the visible label may be a basename, not the path
        }
        if (el.tagName === 'BR') {
          text += '\n';
          return;
        }
        // Chromium wraps wrapped/subsequent lines in <div>; treat that as a newline.
        if ((el.tagName === 'DIV' || el.tagName === 'P') && text && !text.endsWith('\n')) {
          text += '\n';
        }
        walk(el);
      });
    };
    walk(root);
    return { text, images };
  };

  // Reconcile portal state + the image map with the DOM (covers deletions made
  // by editing over a pill), then report the fresh draft.
  const fireChange = () => {
    const root = editorRef.current;
    if (!root) return;
    const live = Array.from(root.querySelectorAll<HTMLElement>('[data-img-id]'))
      .map((el) => el.dataset.imgId)
      .filter((id): id is string => Boolean(id));
    const liveSet = new Set(live);
    // Only replace the pills array when something actually dropped — otherwise a
    // fresh reference re-renders the editor on every keystroke for no reason.
    setPills((prev) => {
      const next = prev.filter((p) => liveSet.has(p.id));
      return next.length === prev.length ? prev : next;
    });
    for (const key of Array.from(imagesRef.current.keys())) {
      if (!liveSet.has(key)) imagesRef.current.delete(key);
    }
    const draft = serialize();
    setEmpty(draft.text.length === 0 && liveSet.size === 0);
    onChange(draft);
  };

  // The caret range, falling back to the last saved range (e.g. after the upload
  // button stole focus), then to the end of the editor.
  const currentRange = (): Range => {
    const root = editorRef.current!;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (root.contains(r.commonAncestorContainer)) return r.cloneRange();
    }
    if (savedRangeRef.current && root.contains(savedRangeRef.current.commonAncestorContainer)) {
      return savedRangeRef.current.cloneRange();
    }
    const end = document.createRange();
    end.selectNodeContents(root);
    end.collapse(false);
    return end;
  };

  const insertImagesAtCaret = (imgs: ChatImageInput[]) => {
    const root = editorRef.current;
    if (!root || imgs.length === 0) return;
    const room = MAX_COMPOSER_IMAGES - imagesRef.current.size;
    const toAdd = imgs.slice(0, Math.max(0, room));
    if (toAdd.length === 0) return;
    const range = currentRange();
    const added: Pill[] = [];
    toAdd.forEach((image) => {
      const id = `img-${idRef.current++}`;
      imagesRef.current.set(id, image);
      const span = document.createElement('span');
      span.dataset.imgId = id;
      span.contentEditable = 'false';
      span.className = 'mx-0.5 inline-flex align-middle';
      range.insertNode(span);
      range.setStartAfter(span);
      range.collapse(true);
      added.push({ id, node: span, image });
    });
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    savedRangeRef.current = range.cloneRange();
    setPills((prev) => [...prev, ...added]);
    fireChange();
    root.focus();
  };

  const removePill = (id: string) => {
    const root = editorRef.current;
    root?.querySelector(`[data-img-id="${id}"]`)?.remove();
    imagesRef.current.delete(id);
    setPills((prev) => prev.filter((p) => p.id !== id));
    fireChange();
    root?.focus();
  };

  const saveSelection = () => {
    const root = editorRef.current;
    const sel = window.getSelection();
    if (
      root &&
      sel &&
      sel.rangeCount > 0 &&
      root.contains(sel.getRangeAt(0).commonAncestorContainer)
    ) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = allowImages
      ? Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
      : [];
    if (files.length > 0) {
      e.preventDefault();
      void filesToImages(files).then(insertImagesAtCaret);
      return;
    }
    // Force plain-text paste so no external HTML/styling leaks into the editor.
    const text = e.clipboardData.getData('text/plain');
    e.preventDefault();
    document.execCommand('insertText', false, text);
  };

  // Allow images to be dropped straight onto the editor, mirroring the paste
  // path. `onDragOver` must preventDefault for the drop to fire.
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (allowImages) e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!allowImages) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    void filesToImages(files).then(insertImagesAtCaret);
  };

  //////////////
  // Mentions //
  //////////////

  const closeMention = () => {
    mentionOpenRef.current = false;
    mentionAnchorRef.current = null;
    setMentionQuery(null);
    setMentionCaret(null);
  };

  // The caret's viewport rect, so the menu can anchor right where you're typing.
  // A collapsed range still reports a caret rect in Chromium (Electron); fall
  // back to the editor's box if it comes back empty.
  const caretRect = (range: Range): MentionCaret => {
    const rect = range.getBoundingClientRect();
    if (rect.height > 0 || rect.top > 0 || rect.left > 0) {
      return { left: rect.left, top: rect.top, bottom: rect.bottom };
    }
    const box = editorRef.current!.getBoundingClientRect();
    return { left: box.left + 8, top: box.top, bottom: box.bottom };
  };

  // (Re)fetch the candidate paths — called once per open so the list stays fresh
  // (e.g. after the active worktree/project changes), like the ⌘P finder.
  const fetchMentionFiles = () => {
    if (!mentions || mentionFetchingRef.current) return;
    mentionFetchingRef.current = true;
    setMentionLoading(true);
    mentions
      .fetch()
      .then((list) => setMentionFiles(list))
      .catch(() => setMentionFiles([]))
      .finally(() => {
        mentionFetchingRef.current = false;
        setMentionLoading(false);
      });
  };

  // Detect an in-progress `@mention` at the caret (a text node ending in `@…`)
  // and open/refresh the menu, recording where the token sits so it can be
  // spliced out on select. Any other caret state closes the menu.
  const updateMention = () => {
    if (!mentions) return;
    const root = editorRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0 || !sel.isCollapsed) return closeMention();
    if (mentionDismissedRef.current) return closeMention();
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return closeMention();
    const offset = sel.anchorOffset;
    const match = MENTION_RE.exec((node.textContent ?? '').slice(0, offset));
    if (!match) return closeMention();
    const query = match[1];
    mentionAnchorRef.current = {
      node: node as Text,
      atIndex: offset - query.length - 1,
      queryLen: query.length,
    };
    const wasOpen = mentionOpenRef.current;
    mentionOpenRef.current = true;
    setMentionQuery(query);
    setMentionCaret(caretRect(sel.getRangeAt(0)));
    if (!wasOpen) fetchMentionFiles();
  };

  // Splice the chosen path over the `@query` as an atomic chip, then drop a
  // trailing space and park the caret after it.
  const replaceMention = (path: string) => {
    const root = editorRef.current;
    const anchor = mentionAnchorRef.current;
    if (!root || !anchor) return;
    const { node, atIndex, queryLen } = anchor;
    const len = node.textContent?.length ?? 0;
    const range = document.createRange();
    range.setStart(node, Math.min(atIndex, len));
    range.setEnd(node, Math.min(atIndex + 1 + queryLen, len));
    range.deleteContents();
    const chip = createMentionChip(path);
    range.insertNode(chip);
    const space = document.createTextNode(' ');
    chip.parentNode?.insertBefore(space, chip.nextSibling);
    const after = document.createRange();
    after.setStartAfter(space);
    after.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(after);
    savedRangeRef.current = after.cloneRange();
    closeMention();
    fireChange();
    root.focus();
  };

  // Reset the highlight whenever the query changes.
  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    clear: () => {
      if (editorRef.current) editorRef.current.innerHTML = '';
      imagesRef.current.clear();
      savedRangeRef.current = null;
      setPills([]);
      setEmpty(true);
      closeMention();
    },
    setText: (text: string) => {
      const root = editorRef.current;
      if (!root) return;
      root.innerHTML = '';
      imagesRef.current.clear();
      setPills([]);
      closeMention();
      if (text) root.appendChild(document.createTextNode(text));
      setEmpty(text.length === 0);
      root.focus();
      const range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      savedRangeRef.current = range.cloneRange();
    },
    setDraft: (draft) => {
      const root = editorRef.current;
      if (!root) return;
      root.innerHTML = '';
      imagesRef.current.clear();
      closeMention();
      if (draft.text) root.appendChild(document.createTextNode(draft.text));
      // Rehydrate image pills after the text (draft restore drops the original
      // interleaving — the exact caret positions aren't worth persisting).
      const images = allowImages ? draft.images.slice(0, MAX_COMPOSER_IMAGES) : [];
      const restored: Pill[] = images.map((image) => {
        const id = `img-${idRef.current++}`;
        imagesRef.current.set(id, image);
        const span = document.createElement('span');
        span.dataset.imgId = id;
        span.contentEditable = 'false';
        span.className = 'mx-0.5 inline-flex align-middle';
        root.appendChild(span);
        return { id, node: span, image };
      });
      setPills(restored);
      setEmpty(draft.text.length === 0 && restored.length === 0);
      const range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      savedRangeRef.current = range.cloneRange();
    },
    insertImages: (images) => {
      if (allowImages) insertImagesAtCaret(images);
    },
    getDraft: () => serialize(),
  }));

  // Defer the query so scoring the full file list per keystroke doesn't block a
  // fast typist on large repos (mirrors the ⌘P finder).
  const deferredMentionQuery = useDeferredValue(mentionQuery);
  const mentionCandidates =
    deferredMentionQuery !== null && mentionFiles
      ? filterMentions(mentionFiles, deferredMentionQuery)
      : [];
  const mentionMenuOpen =
    !!mentions && mentionQuery !== null && (mentionCandidates.length > 0 || mentionLoading);
  const mentionActiveIndex = Math.min(mentionIndex, Math.max(0, mentionCandidates.length - 1));

  // Keep the mirrored plain text in sync + re-arm the menu as the user types.
  const handleInput = () => {
    mentionDismissedRef.current = false;
    fireChange();
    updateMention();
  };

  // Track the caret (for pill inserts) and re-evaluate the mention token.
  const handleSelect = () => {
    saveSelection();
    updateMention();
  };

  const handleBlur = () => {
    saveSelection();
    closeMention();
  };

  // The mention menu owns Escape while open, and Arrow/Enter/Tab once it has
  // files to pick; everything else falls through to the parent's handler.
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (mentionMenuOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        mentionDismissedRef.current = true;
        closeMention();
        return;
      }
      if (mentionCandidates.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((i) => (i + 1) % mentionCandidates.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
          return;
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
          e.preventDefault();
          const path = mentionCandidates[mentionActiveIndex];
          if (path) replaceMention(path);
          return;
        }
      }
    }
    onKeyDown(e);
  };

  return (
    <div className="relative">
      {mentionMenuOpen && mentionCaret && (
        <MentionMenu
          files={mentionCandidates}
          activeIndex={mentionActiveIndex}
          loading={mentionLoading && mentionCandidates.length === 0}
          caret={mentionCaret}
          onSelect={replaceMention}
          onHover={setMentionIndex}
        />
      )}
      {empty && (
        <div className="pointer-events-none absolute left-2 top-1.5 text-sm leading-5 text-muted-foreground">
          {placeholder}
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        onInput={handleInput}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        onKeyUp={handleSelect}
        onMouseUp={handleSelect}
        onBlur={handleBlur}
        className={cn(
          'max-h-48 min-h-[76px] w-full overflow-y-auto whitespace-pre-wrap break-words px-2 py-1.5 text-sm leading-5 text-neutral-100 focus:outline-none',
          disabled && 'cursor-not-allowed opacity-60',
          editorClassName,
        )}
      />
      {pills.map((p) =>
        createPortal(
          <ImagePill
            name={p.image.name ?? 'image'}
            mediaType={p.image.mediaType}
            data={p.image.data}
            onRemove={() => removePill(p.id)}
          />,
          p.node,
        ),
      )}
    </div>
  );
});
