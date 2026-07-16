'use client';

import { GitPullRequest } from 'lucide-react';
import { type LinearPrRef, LinearPrStatus } from '@flowstate/shared';
import { trpc } from '@/lib/trpc';
import { cn } from '../ui/cn';

///////////////
// Constants //
///////////////

/** Label + colour accent per PR status. */
const PR_META: Record<LinearPrStatus, { label: string; className: string }> = {
  [LinearPrStatus.Open]: { label: 'Open', className: 'text-success border-success/40' },
  [LinearPrStatus.Merged]: { label: 'Merged', className: 'text-[#a371f7] border-[#a371f7]/40' },
  [LinearPrStatus.Closed]: { label: 'Closed', className: 'text-danger border-danger/40' },
  [LinearPrStatus.Draft]: { label: 'Draft', className: 'text-muted-foreground border-border' },
};

////////////
// Export //
////////////

/**
 * A compact badge for the GitHub PR linked to an issue: `⇄ #46 Open`. Clicking it
 * opens the PR externally. Renders nothing when the issue has no PR.
 */
export function PrBadge({ pr, className }: { pr: LinearPrRef | null; className?: string }) {
  if (!pr) return null;
  const meta = PR_META[pr.status];
  return (
    <span
      role="button"
      tabIndex={-1}
      title={`PR #${pr.number} · ${meta.label}`}
      onClick={(e) => {
        e.stopPropagation();
        void trpc().app.openExternal.mutate({ url: pr.url });
      }}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-muted',
        meta.className,
        className,
      )}
    >
      <GitPullRequest className="size-3" />
      #{pr.number}
      <span className="opacity-80">{meta.label}</span>
    </span>
  );
}
