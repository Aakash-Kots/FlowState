'use client';

import type { LinearIssueRef } from '@flowstate/shared';
import { LinearTicketChip } from '../linear/LinearTicketChip';

////////////
// Export //
////////////

/**
 * A subtle, system-style transcript line shown while a ticket-linked worktree is
 * spinning up: "Initialising worktree with ticket {chip}". The ticket is the
 * hoverable `LinearTicketChip`, so its details are one hover away. Rendered at the
 * top of the chat until the first assistant response arrives.
 */
export function InitialisingMessage({ issue }: { issue: LinearIssueRef }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
      <span>Initialising worktree with ticket</span>
      <LinearTicketChip issue={issue} />
    </div>
  );
}
