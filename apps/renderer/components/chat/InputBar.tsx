'use client';

import { useEffect, useRef, useState } from 'react';
import { ClaudeSessionState } from '@flowstate/shared';
import { interruptSession, sendPrompt, useChat } from '@/lib/chat';
import { Button } from '../ui/Button';

const MAX_ROWS = 8;
const LINE_HEIGHT_PX = 20;

/**
 * The custom prompt bar: auto-growing textarea, Enter to send, Shift+Enter for
 * a newline, Esc to interrupt a running turn.
 */
export function InputBar({ disabled }: { disabled: boolean }) {
  const sessionState = useChat((s) => s.sessionState);
  const error = useChat((s) => s.error);
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const busy =
    sessionState === ClaudeSessionState.Running || sessionState === ClaudeSessionState.Waiting;

  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * LINE_HEIGHT_PX + 20)}px`;
  };

  const submit = () => {
    if (disabled || !text.trim()) return;
    sendPrompt(text);
    setText('');
    requestAnimationFrame(resize);
  };

  return (
    <div className="border-t border-edge bg-surface px-5 py-3.5">
      <div className="mx-auto max-w-3xl">
        {error && (
          <div className="mb-2 rounded-md border border-danger/40 bg-raised px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            rows={1}
            disabled={disabled}
            placeholder={
              disabled
                ? 'Choose a folder to start…'
                : 'Message Claude — Enter to send, Shift+Enter for a new line'
            }
            onChange={(e) => {
              setText(e.target.value);
              resize();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape' && busy) {
                e.preventDefault();
                interruptSession();
              }
            }}
            className="max-h-48 min-h-[40px] flex-1 resize-none rounded-md border border-edge bg-raised px-3 py-2.5 text-sm leading-5 text-neutral-100 placeholder:text-muted focus:border-accent/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          {busy ? (
            <Button variant="secondary" className="text-danger" onClick={interruptSession}>
              Stop
            </Button>
          ) : (
            <Button onClick={submit} disabled={disabled || !text.trim()}>
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
