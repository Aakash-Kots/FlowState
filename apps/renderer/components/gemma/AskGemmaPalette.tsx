'use client';

import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, Loader2, Sparkles, Wrench, X } from 'lucide-react';
import { LocalModelState } from '@flowstate/shared';
import { askGemma, closeAskGemma, resetAsk, respondGemmaTool, useGemma } from '@/lib/gemma';
import { Markdown } from '../chat/Markdown';

/**
 * The "Ask Gemini" palette — a centered prompt box that calls Google's Gemini
 * API and streams the reply inline. Opened by double-tapping Space (see
 * `ShortcutProvider`). Enter sends; Shift+Enter adds a newline; Esc closes.
 * Requires a Gemini API key (set in Settings); prompts for one when absent.
 */
export function AskGemmaPalette() {
  const open = useGemma((s) => s.open);
  const prompt = useGemma((s) => s.prompt);
  const response = useGemma((s) => s.response);
  const streaming = useGemma((s) => s.streaming);
  const error = useGemma((s) => s.error);
  const tools = useGemma((s) => s.tools);
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

  // Absent status = no API key stored yet; prompt the user to add one.
  const needsKey = modelStatus?.state === LocalModelState.Absent;

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
          <DialogPrimitive.Title className="sr-only">Ask Gemini</DialogPrimitive.Title>

          {/* Prompt input */}
          <div className="flex items-start gap-2 border-b border-border px-3">
            <Sparkles className="mt-3.5 size-4 shrink-0 text-primary" />
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask Gemini anything…"
              spellCheck={false}
              className="max-h-40 flex-1 resize-none bg-transparent py-3 text-sm text-neutral-100 placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {/* Needs-key hint / streamed answer / error */}
          {(answered || needsKey || error) && (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {needsKey && !answered && (
                <p className="text-sm text-muted-foreground">
                  Add a Gemini API key in Settings to use Ask Gemini.
                </p>
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
                    tools.length === 0 && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )
                  )}
                  {tools.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {tools.map((tool) => (
                        <ToolCardView key={tool.id} tool={tool} />
                      ))}
                    </div>
                  )}
                </>
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>Powered by Gemini</span>
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

type ToolCard = ReturnType<typeof useGemma.getState>['tools'][number];

/** One tool call: a confirmation card with Approve/Deny while pending, then a
 * status + result line once it runs (or is denied). */
function ToolCardView({ tool }: { tool: ToolCard }) {
  const pending = tool.status === 'pending';
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 text-sm text-neutral-200">
        {tool.status === 'running' ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
        ) : tool.status === 'done' ? (
          <Check className="size-3.5 shrink-0 text-success" />
        ) : tool.status === 'error' || tool.status === 'denied' ? (
          <X className="size-3.5 shrink-0 text-danger" />
        ) : (
          <Wrench className="size-3.5 shrink-0 text-primary" />
        )}
        <span className="flex-1 truncate">{tool.title}</span>
      </div>

      {pending && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => respondGemmaTool(tool.id, true)}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => respondGemmaTool(tool.id, false)}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Deny
          </button>
        </div>
      )}

      {tool.result && !pending && (
        <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground">{tool.result}</p>
      )}
    </div>
  );
}
