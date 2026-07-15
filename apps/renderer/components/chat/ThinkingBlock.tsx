'use client';

import { memo, useState } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { cn } from '../ui/cn';

////////////
// Export //
////////////

/**
 * An assistant reasoning block: a compact `🧠 Thinking` header that discloses
 * the reasoning text on click. Rendered only when the message actually carries
 * thinking content, so the header doubles as the signal that the model reasoned.
 */
export const ThinkingBlock = memo(function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  // First line of reasoning, shown inline beside the label as a preview (hidden
  // once expanded, where the full text renders below).
  const preview = paragraphs[0]?.replace(/\s+/g, ' ').trim() ?? '';
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="-mx-2">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-neutral-300">
        <Brain className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium text-neutral-200">Thinking</span>
        {!open && preview && (
          <span className="min-w-0 flex-1 truncate text-left italic text-muted-foreground/70">
            {preview}
          </span>
        )}
        <ChevronRight
          className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-2 mt-1 space-y-2 border-l-2 border-border pl-3">
        {paragraphs.map((p, i) => (
          <p
            key={i}
            className="whitespace-pre-wrap text-xs italic leading-relaxed text-muted-foreground"
          >
            {p}
          </p>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
});
