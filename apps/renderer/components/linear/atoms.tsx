'use client';

import { ClaudeSessionState } from '@flowstate/shared';
import { cn } from '../ui/cn';

/**
 * Small presentational atoms shared across the Linear tab: a workflow-state colour
 * dot, a user avatar (image or initial fallback), and a linked worktree's
 * Claude-session status dot.
 */

/** Colour accent per Claude session state (for a linked worktree's status dot). */
const CLAUDE_STATE_DOT: Record<ClaudeSessionState, string> = {
  [ClaudeSessionState.Idle]: 'bg-muted-foreground',
  [ClaudeSessionState.Running]: 'bg-success',
  [ClaudeSessionState.Waiting]: 'bg-warn',
  [ClaudeSessionState.Error]: 'bg-danger',
};

/** A dot coloured by a linked worktree's Claude session state. */
export function ClaudeStateDot({ state, className }: { state: ClaudeSessionState; className?: string }) {
  return <span className={cn('size-2 shrink-0 rounded-full', CLAUDE_STATE_DOT[state], className)} />;
}

/** A filled dot in the state's Linear-assigned hex colour. */
export function StateDot({
  color,
  title,
  className,
}: {
  color: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      title={title}
      style={{ backgroundColor: color }}
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
    />
  );
}

/** A round user avatar — the image when available, else the name's initial. */
export function Avatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string;
  className?: string;
}) {
  const base = cn('shrink-0 rounded-full object-cover', className);
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} className={base} />;
  }
  return (
    <span
      className={cn(
        base,
        'flex items-center justify-center bg-muted text-[10px] font-medium uppercase text-muted-foreground',
      )}
    >
      {name.trim().charAt(0) || '?'}
    </span>
  );
}
