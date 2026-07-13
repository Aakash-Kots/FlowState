'use client';

import { useEffect, useRef, useState } from 'react';
import { ClaudeSessionState } from '@flowstate/shared';
import { interruptSession, sendPrompt, useChat, useFocusInput, useTabId } from '@/lib/chat';
import { Button } from '../ui/Button';
import { InlinePrompt } from './InlinePrompt';
import { InputToolbar } from './InputToolbar';

const MAX_ROWS = 8;
const LINE_HEIGHT_PX = 20;

/**
 * The floating prompt bar: a rounded card overlaid on the bottom of the
 * conversation (which scrolls beneath it behind a gradient fade). Holds an
 * auto-growing textarea + model/effort toolbar, and swaps to an inline
 * permission/question prompt when Claude is waiting on the user.
 */
export function InputBar({ disabled }: { disabled: boolean }) {
  const tabId = useTabId();
  const sessionState = useChat((s) => s.sessionState);
  const error = useChat((s) => s.error);
  const hasPrompt = useChat(
    (s) => s.pendingPermissions.length > 0 || s.pendingQuestions.length > 0,
  );
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const busy =
    sessionState === ClaudeSessionState.Running || sessionState === ClaudeSessionState.Waiting;

  useEffect(() => {
    if (!disabled && !hasPrompt) textareaRef.current?.focus();
  }, [disabled, hasPrompt]);

  // Let the FocusInput shortcut focus the composer from anywhere.
  useFocusInput(() => textareaRef.current?.focus());

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * LINE_HEIGHT_PX + 20)}px`;
  };

  const submit = () => {
    if (disabled || !text.trim()) return;
    sendPrompt(tabId, text);
    setText('');
    requestAnimationFrame(resize);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-base via-base/95 to-transparent px-4 pb-4 pt-10">
      <div className="pointer-events-auto mx-auto max-w-3xl">
        {error && (
          <div className="mb-2 rounded-md border border-danger/40 bg-raised px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
        <div className="rounded-2xl border border-edge bg-raised shadow-lg shadow-black/20">
          {hasPrompt ? (
            <InlinePrompt />
          ) : (
            <>
              <div className="flex items-end gap-2 px-2.5 py-2">
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
                      interruptSession(tabId);
                    }
                  }}
                  className="max-h-48 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-5 text-neutral-100 placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
                {busy ? (
                  <Button
                    variant="secondary"
                    className="text-danger"
                    onClick={() => interruptSession(tabId)}
                  >
                    Stop
                  </Button>
                ) : (
                  <Button onClick={submit} disabled={disabled || !text.trim()}>
                    Send
                  </Button>
                )}
              </div>
              <InputToolbar disabled={disabled} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
