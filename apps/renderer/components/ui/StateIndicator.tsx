'use client';

import { Loader2 } from 'lucide-react';
import { ClaudeSessionState } from '@flowstate/shared';
import { cn } from './cn';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

// The resting states that read as a colored dot (Running spins instead — see
// below — and Idle shows nothing unless it's unread).
const DOT: Partial<Record<ClaudeSessionState, { cls: string; label: string }>> = {
  [ClaudeSessionState.Waiting]: { cls: 'bg-info', label: 'Needs input' },
  [ClaudeSessionState.Error]: { cls: 'bg-danger', label: 'Error' },
};

/** A dot/tooltip wrapper so every indicator shares one hover affordance. */
function Marker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A tab/worktree's live agent status: a spinner while working, a colored dot for
 * needs-input/error, and — when nothing is live — an unread dot if the agent
 * finished and the user hasn't opened it yet. Renders nothing when idle + read.
 */
export function StateIndicator({
  state,
  unread = false,
  className,
}: {
  state: ClaudeSessionState;
  unread?: boolean;
  className?: string;
}) {
  if (state === ClaudeSessionState.Running) {
    return (
      <Marker label="Working…">
        <span className={cn('inline-flex shrink-0', className)} aria-label="Working…">
          <Loader2 className="size-3 animate-spin text-warn" />
        </span>
      </Marker>
    );
  }

  const dot = DOT[state];
  if (dot) {
    return (
      <Marker label={dot.label}>
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot.cls, className)}
          aria-label={dot.label}
        />
      </Marker>
    );
  }

  if (unread) {
    return (
      <Marker label="Finished — unread">
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full bg-primary', className)}
          aria-label="Finished — unread"
        />
      </Marker>
    );
  }

  return null;
}
