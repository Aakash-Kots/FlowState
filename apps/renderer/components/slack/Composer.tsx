'use client';

import { type KeyboardEvent } from 'react';
import { SendHorizontal } from 'lucide-react';
import { sendActiveMessage, setComposerText, useSlack } from '@/lib/slack';
import { cn } from '../ui/cn';

/**
 * The message composer for the active channel. Enter sends; Shift+Enter inserts a
 * newline. Disabled while a send is in flight.
 */
export function Composer({ channelName }: { channelName: string }) {
  const text = useSlack((s) => s.composerText);
  const sending = useSlack((s) => s.sending);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendActiveMessage();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t border-border bg-secondary px-3 py-2">
      <textarea
        value={text}
        onChange={(e) => setComposerText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={`Message #${channelName}`}
        className="max-h-32 min-h-9 flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => void sendActiveMessage()}
        disabled={sending || !text.trim()}
        title="Send"
        className={cn(
          'inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        <SendHorizontal className="size-4" />
      </button>
    </div>
  );
}
