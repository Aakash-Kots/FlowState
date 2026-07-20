'use client';

import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, Sparkles } from 'lucide-react';
import { LocalModelState } from '@flowstate/shared';
import { askGemma, closeAskGemma, resetAsk, useGemma } from '@/lib/gemma';
import { Markdown } from '../chat/Markdown';

/**
 * The "Ask Gemma" palette — a centered prompt box that runs the on-device
 * generative model and streams the reply inline. Opened by double-tapping Space
 * (see `ShortcutProvider`). Enter sends; Shift+Enter adds a newline; Esc closes.
 * On first use it downloads the model, showing progress in place.
 */
export function AskGemmaPalette() {
  const open = useGemma((s) => s.open);
  const prompt = useGemma((s) => s.prompt);
  const response = useGemma((s) => s.response);
  const streaming = useGemma((s) => s.streaming);
  const error = useGemma((s) => s.error);
  const modelStatus = useGemma((s) => s.modelStatus);

  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset + focus the input each time the palette opens.
  useEffect(() => {
    if (!open) return;
    setText('');
    const id = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(id);
  }, [open]);

  const preparing =
    modelStatus?.state === LocalModelState.Downloading || modelStatus?.state === LocalModelState.Loading;
  const prepLabel =
    modelStatus?.state === LocalModelState.Downloading
      ? `Downloading Gemma… ${Math.round((modelStatus.downloadProgress ?? 0) * 100)}%`
      : 'Loading Gemma…';

  const submit = () => {
    if (text.trim()) askGemma(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const answered = prompt.length > 0;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closeAskGemma();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[14%] z-50 flex max-h-[72vh] w-full max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">Ask Gemma</DialogPrimitive.Title>

          {/* Prompt input */}
          <div className="flex items-start gap-2 border-b border-border px-3">
            <Sparkles className="mt-3.5 size-4 shrink-0 text-primary" />
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask Gemma anything…"
              spellCheck={false}
              className="max-h-40 flex-1 resize-none bg-transparent py-3 text-sm text-neutral-100 placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {/* Prep / streamed answer / error */}
          {(answered || preparing || error) && (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {preparing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {prepLabel}
                </div>
              )}
              {answered && (
                <>
                  <p className="mb-2 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {prompt}
                  </p>
                  {response ? (
                    <div className="text-sm leading-relaxed text-neutral-200">
                      <Markdown>{response}</Markdown>
                    </div>
                  ) : (
                    streaming &&
                    !preparing && <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                </>
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>On-device · Gemma&nbsp;3</span>
            {answered ? (
              <button type="button" onClick={resetAsk} className="transition-colors hover:text-foreground">
                Ask another
              </button>
            ) : (
              <span>Enter to send · Esc to close</span>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
