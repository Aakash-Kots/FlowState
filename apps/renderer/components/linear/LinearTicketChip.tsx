'use client';

import { Tag } from 'lucide-react';
import type { LinearIssueRef } from '@flowstate/shared';
import { ensureIssueDetail } from '@/lib/linear';
import { cn } from '../ui/cn';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import { LinearTicketDetail } from './LinearTicketDetail';

////////////
// Export //
////////////

/**
 * A Linear issue as a compact chip: the `Tag` glyph next to the identifier, in a
 * cream border like `FileRef` — the one visual for "a ticket" wherever it's
 * embedded. Default behaviour reveals the full ticket in a hover card (the chat
 * "initialising" message). Pass `onClick` for a plain clickable chip with no hover
 * menu — used by the New-worktree modal, which swaps to its own ticket view on
 * click instead.
 */
export function LinearTicketChip({
  issue,
  className,
  onClick,
}: {
  issue: LinearIssueRef;
  className?: string;
  onClick?: () => void;
}) {
  const chip = (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 rounded-md border border-primary/50 bg-primary/5 px-1.5 py-0.5 align-baseline',
        onClick ? 'cursor-pointer hover:bg-primary/10' : 'cursor-help',
        className,
      )}
    >
      <Tag className="size-3.5 shrink-0 text-primary/80" />
      <span className="min-w-0 truncate font-mono text-neutral-200">{issue.identifier}</span>
    </span>
  );

  // Click mode: a plain button, no hover card (the modal owns the detail view).
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="inline-flex min-w-0 max-w-full">
        {chip}
      </button>
    );
  }

  // Default: hover to reveal the full ticket, fetched on open and clipped to a
  // scrollable card.
  return (
    <HoverCard
      openDelay={150}
      closeDelay={100}
      onOpenChange={(nextOpen) => {
        if (nextOpen) void ensureIssueDetail(issue.id);
      }}
    >
      <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-3">
        <div className="max-h-80 overflow-y-auto">
          <LinearTicketDetail issue={issue} />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
