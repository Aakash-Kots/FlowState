'use client';

import { useMemo } from 'react';
import { GitBranch } from 'lucide-react';
import { type LinearIssue, type LinkedWorktree } from '@flowstate/shared';
import { selectIssue, useLinear, worktreesByIssue } from '@/lib/linear';
import { selectWorkspace } from '@/lib/workspace';
import { cn } from '../ui/cn';
import { Avatar, ClaudeStateDot, StateDot } from './atoms';
import { PrBadge } from './PrBadge';
import { PriorityIcon } from './PriorityIcon';

///////////////////
// Sub-components //
///////////////////

/** One large card: an assigned issue plus the worktrees running against it. */
function WorkCard({ issue, worktrees }: { issue: LinearIssue; worktrees: LinkedWorktree[] }) {
  const isSelected = useLinear((s) => s.selectedIssueId === issue.id);
  return (
    <button
      type="button"
      onClick={() => selectIssue(issue.id)}
      className={cn(
        'flex w-72 shrink-0 flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
        isSelected ? 'border-primary/60 bg-accent' : 'border-border hover:bg-muted',
      )}
    >
      <div className="flex items-center gap-2">
        <StateDot color={issue.state.color} title={issue.state.name} />
        <span className="font-mono text-[11px] text-muted-foreground">{issue.identifier}</span>
        <PriorityIcon priority={issue.priority} className="ml-auto" />
        {issue.assignee && (
          <Avatar name={issue.assignee.name} avatarUrl={issue.assignee.avatarUrl} className="size-4" />
        )}
      </div>

      <span className="line-clamp-2 text-[15px] font-medium leading-snug text-neutral-100">
        {issue.title}
      </span>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {worktrees.map((w) => (
          <span
            key={w.workspaceId}
            role="button"
            tabIndex={-1}
            title={w.branch}
            onClick={(e) => {
              e.stopPropagation();
              void selectWorkspace(w.workspaceId);
            }}
            className="inline-flex max-w-[10rem] items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-neutral-200 transition-colors hover:bg-accent"
          >
            <ClaudeStateDot state={w.claudeState} />
            <GitBranch className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{w.name}</span>
          </span>
        ))}
        {issue.pr && <PrBadge pr={issue.pr} />}
      </div>
    </button>
  );
}

////////////
// Export //
////////////

/**
 * "Active work" — assigned issues that have at least one local worktree, shown as
 * large cards with their worktree chips + PR badge. Hidden entirely when there's
 * no active work.
 */
export function ActiveWorkSection() {
  const myWorkIssues = useLinear((s) => s.myWorkIssues);
  const linkedWorktrees = useLinear((s) => s.linkedWorktrees);

  const cards = useMemo(() => {
    const byIssue = worktreesByIssue(linkedWorktrees);
    return myWorkIssues
      .filter((i) => byIssue.has(i.id))
      .map((issue) => ({ issue, worktrees: byIssue.get(issue.id)! }));
  }, [myWorkIssues, linkedWorktrees]);

  if (cards.length === 0) return null;

  return (
    <div className="border-b border-border px-3 py-2">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="size-1.5 rounded-full bg-success" />
        Active work
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cards.map(({ issue, worktrees }) => (
          <WorkCard key={issue.id} issue={issue} worktrees={worktrees} />
        ))}
      </div>
    </div>
  );
}
