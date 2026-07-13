'use client';

import { sendPrompt, useTabId } from '@/lib/chat';

///////////////
// Constants //
///////////////

// Clickable conversation starters. `prompt` is sent verbatim; `label`/`glyph`
// are presentational only.
const STARTERS: { glyph: string; label: string; prompt: string }[] = [
  {
    glyph: '📖',
    label: 'Explain this codebase',
    prompt: 'Explain this codebase — its architecture, entry points, and conventions.',
  },
  {
    glyph: '🐛',
    label: 'Find & fix a bug',
    prompt: "Help me find and fix a bug. I'll describe the symptom and you investigate.",
  },
  {
    glyph: '✨',
    label: 'Add a feature',
    prompt: 'I want to add a feature. Help me plan it, then implement it.',
  },
  {
    glyph: '🧪',
    label: 'Write tests',
    prompt: 'Write tests for an existing file or function in this project.',
  },
];

/**
 * Empty-conversation placeholder: a short intro plus a column of clickable
 * starter prompts that seed the very first turn via `sendPrompt`.
 */
export function EmptyChat() {
  const tabId = useTabId();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-20">
      <div className="text-center">
        <h2 className="text-sm font-semibold text-neutral-100">Start a session</h2>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Ask in plain language — Claude reads, edits, and runs code in your folder with your
          approval.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2">
        {STARTERS.map((starter) => (
          <button
            key={starter.label}
            type="button"
            onClick={() => sendPrompt(tabId, starter.prompt)}
            className="flex items-center gap-2.5 rounded-md border border-edge bg-surface px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-raised hover:text-neutral-100"
          >
            <span className="shrink-0 text-muted-foreground">{starter.glyph}</span>
            {starter.label}
          </button>
        ))}
      </div>
    </div>
  );
}
