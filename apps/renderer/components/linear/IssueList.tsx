'use client';

import { useMemo } from 'react';
import { GitBranch } from 'lucide-react';
import { type LinearIssue } from '@flowstate/shared';
import { selectIssue, useLinear } from '@/lib/linear';
import { useProjects } from '@/lib/projects';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '../ui/cn';
import { Avatar, StateDot } from './atoms';
import { PrBadge } from './PrBadge';
import { PriorityIcon } from './PriorityIcon';

/** One issue row: priority, state dot, identifier, title, PR/worktree, assignee. */
function IssueRow({ issue, isCurrent }: { issue: LinearIssue; isCurrent: boolean }) {
  const isSelected = useLinear((s) => s.selectedIssueId === issue.id);
  const linkedCount = useLinear(
    (s) => s.linkedWorktrees.filter((w) => w.issueId === issue.id).length,
  );

  return (
    <button
      type="button"
      onClick={() => selectIssue(issue.id)}
      className={cn(
        'group flex w-full items-center gap-2 rounded border-l-2 px-2 py-1.5 text-left text-[13px] transition-colors',
        isCurrent ? 'border-primary' : 'border-transparent',
        isSelected ? 'bg-accent text-neutral-100' : 'hover:bg-muted',
      )}
      title={isCurrent ? 'Linked to the worktree you have open' : undefined}
    >
      <PriorityIcon priority={issue.priority} />
      <StateDot color={issue.state.color} title={issue.state.name} />
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{issue.identifier}</span>
      <span className="min-w-0 flex-1 truncate text-neutral-200">{issue.title}</span>
      {issue.pr && <PrBadge pr={issue.pr} />}
      {linkedCount > 0 && (
        <span
          className="flex shrink-0 items-center gap-0.5 text-[11px] text-primary"
          title={`${linkedCount} linked worktree${linkedCount > 1 ? 's' : ''}`}
        >
          <GitBranch className="size-3" />
          {linkedCount}
        </span>
      )}
      {issue.assignee && (
        <Avatar
          name={issue.assignee.name}
          avatarUrl={issue.assignee.avatarUrl}
          className="size-4"
        />
      )}
    </button>
  );
}

/**
 * The left column: browsable issues for the current team/search filter, ordered
 * by most-recently-updated (server-side). Selecting one loads it into the detail
 * panel.
 */
export function IssueList() {
  const issues = useLinear((s) => s.issues);
  const loading = useLinear((s) => s.issuesLoading);

  // The issue linked to the worktree currently open — highlighted in the list.
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const currentIssueId = useProjects((s) => {
    for (const list of Object.values(s.worktrees)) {
      const match = list.find((w) => w.id === workspaceId);
      if (match) return match.linearIssue?.id ?? null;
    }
    return null;
  });

  const rows = useMemo(() => issues, [issues]);

  return (
    <div className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-border">
      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          {loading ? 'Loading issues…' : 'No issues'}
        </div>
      ) : (
        <div className="flex flex-col py-1">
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Issues
            </span>
            <span className="text-[11px] text-muted-foreground">{rows.length}</span>
          </div>
          <div className="flex flex-col px-1">
            {rows.map((issue) => (
              <IssueRow key={issue.id} issue={issue} isCurrent={issue.id === currentIssueId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
