'use client';

import { useState } from 'react';
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
export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-neutral-300">
        <Brain className="size-3.5" />
        <span className="font-medium">Thinking</span>
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-2 border-l-2 border-border pl-3">
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
}
