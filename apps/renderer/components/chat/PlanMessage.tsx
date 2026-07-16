'use client';

import { memo, useState } from 'react';
import { Check, ChevronRight, ClipboardList, Copy } from 'lucide-react';
import { EXIT_PLAN_MODE_TOOL } from '@/lib/constants/tools';
import { exitPlanModeInputSchema } from '@/lib/schemas/toolInput';
import { useChat } from '@/lib/chat';
import type { ToolUseBlock } from '@/lib/types/chat';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { cn } from '../ui/cn';
import { Markdown } from './Markdown';

/**
 * A proposed plan (`ExitPlanMode`) rendered inline in the message stream as a
 * full-width, borderless markdown message behind a `Propose plan` toggle — no
 * bordered card, no narrow tool-row nesting. It auto-expands while the plan
 * awaits a decision (so it's readable), and collapses to just the label once
 * resolved. The approve / keep-planning controls live on the composer
 * (`InputBar`), keyed off the pending permission.
 */
export const PlanMessage = memo(function PlanMessage({ block }: { block: ToolUseBlock }) {
  const parsed = exitPlanModeInputSchema.safeParse(block.input);
  const plan = parsed.success ? parsed.data.plan : null;
  // The tool_use block and its permission request share no id, so correlate on
  // tool name + plan text — there's at most one plan awaiting a decision.
  const pending = useChat((s) =>
    s.pendingPermissions.some((p) => {
      if (p.toolName !== EXIT_PLAN_MODE_TOOL) return false;
      const pp = exitPlanModeInputSchema.safeParse(p.input);
      return pp.success && pp.data.plan === plan;
    }),
  );
  const [userOpen, setUserOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!plan?.trim()) return null;
  const open = pending || userOpen;

  const copy = () => {
    void navigator.clipboard.writeText(plan).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setUserOpen}>
      <div className="flex items-center gap-2 font-mono text-xs text-amber-300">
        <CollapsibleTrigger
          disabled={pending}
          className="flex items-center gap-2 rounded-md py-0.5 transition-colors enabled:hover:text-amber-200"
        >
          <ChevronRight
            className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
          />
          <ClipboardList className="size-3.5" />
          <span className="font-medium">Propose plan</span>
        </CollapsibleTrigger>
        <button
          type="button"
          onClick={copy}
          title="Copy plan"
          className="inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-neutral-200"
        >
          {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
        </button>
      </div>
      <CollapsibleContent className="mt-2">
        <Markdown variant="plan">{plan}</Markdown>
      </CollapsibleContent>
    </Collapsible>
  );
});
