'use client';

import { memo, useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { cn } from '../ui/cn';
import { Markdown } from './Markdown';

////////////
// Export //
////////////

/**
 * The pre-plan "report" — assistant prose emitted in the same turn as, and just
 * before, an `ExitPlanMode` plan. It's usually a lot of narration the user
 * rarely wants, so it renders behind an always-collapsed `Notes` disclosure
 * (mirroring `ThinkingBlock`), keeping the plan itself the prominent artifact.
 */
export const PlanReportMessage = memo(function PlanReportMessage({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  // First line of the report, shown inline beside the label as a preview (hidden
  // once expanded, where the full markdown renders below).
  const preview =
    text
      .split(/\n{2,}/)
      .find((p) => p.trim())
      ?.replace(/\s+/g, ' ')
      .trim() ?? '';
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="-mx-2">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-neutral-300">
        <FileText className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium text-neutral-200">Notes</span>
        {!open && preview && (
          <span className="min-w-0 flex-1 truncate text-left italic text-muted-foreground/70">
            {preview}
          </span>
        )}
        <ChevronRight
          className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-2 mt-1 border-l-2 border-border pl-3">
        <Markdown>{text}</Markdown>
      </CollapsibleContent>
    </Collapsible>
  );
});
