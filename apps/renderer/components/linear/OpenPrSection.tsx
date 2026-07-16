'use client';

import { useMemo } from 'react';
import { GitPullRequest } from 'lucide-react';
import { LinearPrStatus, type LinearIssue } from '@flowstate/shared';
import { selectIssue, useLinear } from '@/lib/linear';
import { cn } from '../ui/cn';
import { StateDot } from './atoms';
import { PrBadge } from './PrBadge';

///////////////////
// Sub-components //
///////////////////

/** One compact row: an assigned issue whose linked GitHub PR is open. */
function PrRow({ issue }: { issue: LinearIssue }) {
  const isSelected = useLinear((s) => s.selectedIssueId === issue.id);
  return (
    <button
      type="button"
      onClick={() => selectIssue(issue.id)}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors',
        isSelected ? 'bg-accent text-neutral-100' : 'hover:bg-muted',
      )}
    >
      <StateDot color={issue.state.color} title={issue.state.name} />
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{issue.identifier}</span>
      <span className="min-w-0 flex-1 truncate text-neutral-200">{issue.title}</span>
      <PrBadge pr={issue.pr} />
    </button>
  );
}

////////////
// Export //
////////////

/**
 * "Open PRs" — assigned issues whose linked GitHub PR is open (from Linear
 * attachments). Hidden entirely when none are open.
 */
export function OpenPrSection() {
  const myWorkIssues = useLinear((s) => s.myWorkIssues);

  const rows = useMemo(
    () => myWorkIssues.filter((i) => i.pr?.status === LinearPrStatus.Open),
    [myWorkIssues],
  );

  if (rows.length === 0) return null;

  return (
    <div className="border-b border-border px-3 py-2">
      <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <GitPullRequest className="size-3.5 text-success" />
        Open PRs
      </h3>
      <div className="flex flex-col">
        {rows.map((issue) => (
          <PrRow key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  );
}
