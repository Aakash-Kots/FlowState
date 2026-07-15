'use client';

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { ChatImageInput } from '@flowstate/shared';
import { fileToChatImage } from '@/lib/chat';
import { MAX_COMPOSER_IMAGES, MAX_COMPOSER_IMAGE_BYTES } from '@/lib/constants/chat';
import { cn } from '../ui/cn';
import { ImagePill } from './ImagePill';

///////////
// Types //
///////////

/** The composer's current content: typed text plus attached images, in order. */
export type ComposerDraft = { text: string; images: ChatImageInput[] };

/** Imperative API the InputBar drives the rich editor through. */
export type ComposerEditorHandle = {
  focus: () => void;
  clear: () => void;
  /** Replace all content with plain text (drops images), caret at the end. */
  setText: (text: string) => void;
  /** Insert image pills at the caret (or the end when unfocused). */
  insertImages: (images: ChatImageInput[]) => void;
  getDraft: () => ComposerDraft;
};

/** A live image pill mounted into the editor via a portal onto its host span. */
type Pill = { id: string; node: HTMLSpanElement; image: ChatImageInput };

/////////////
// Helpers //
/////////////

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
  }
>(function ComposerEditor({ disabled, placeholder, onChange, onKeyDown }, ref) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<Map<string, ChatImageInput>>(new Map());
  const idRef = useRef(0);
  const savedRangeRef = useRef<Range | null>(null);
  const [pills, setPills] = useState<Pill[]>([]);
  const [empty, setEmpty] = useState(true);

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
    setPills((prev) => prev.filter((p) => liveSet.has(p.id)));
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
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
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

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    clear: () => {
      if (editorRef.current) editorRef.current.innerHTML = '';
      imagesRef.current.clear();
      savedRangeRef.current = null;
      setPills([]);
      setEmpty(true);
    },
    setText: (text: string) => {
      const root = editorRef.current;
      if (!root) return;
      root.innerHTML = '';
      imagesRef.current.clear();
      setPills([]);
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
    insertImages: (images) => insertImagesAtCaret(images),
    getDraft: () => serialize(),
  }));

  return (
    <div className="relative">
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
        onInput={fireChange}
        onPaste={handlePaste}
        onKeyDown={onKeyDown}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onBlur={saveSelection}
        className={cn(
          'max-h-48 min-h-[76px] w-full overflow-y-auto whitespace-pre-wrap break-words px-2 py-1.5 text-sm leading-5 text-neutral-100 focus:outline-none',
          disabled && 'cursor-not-allowed opacity-60',
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
