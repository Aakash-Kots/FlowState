'use client';

import { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import type { LinearIssueRef } from '@flowstate/shared';
import { ensureIssueDetail, useLinear } from '@/lib/linear';
import { trpc } from '@/lib/trpc';
import { Markdown } from '../chat/Markdown';
import { Skeleton } from '../ui/skeleton';
import { Avatar, StateDot } from './atoms';
import { PrBadge } from './PrBadge';
import { PriorityIcon, priorityLabel } from './PriorityIcon';

////////////
// Export //
////////////

/**
 * Read-only ticket details: identifier + open-in-Linear, title, status/assignee,
 * priority, linked PR, and the markdown description. Fetches the full issue on
 * mount (cached), falling back to the ref's own fields while it loads / on error.
 * Renders flat — the parent decides the scroll boundary — so it can fill the
 * New-worktree modal's ticket view or sit inside the chat hover card.
 */
export function LinearTicketDetail({ issue }: { issue: LinearIssueRef }) {
  const detail = useLinear((s) => s.issueDetailsById[issue.id]);

  useEffect(() => {
    void ensureIssueDetail(issue.id);
  }, [issue.id]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{issue.identifier}</span>
        <button
          type="button"
          onClick={() => void trpc().app.openExternal.mutate({ url: issue.url })}
          title="Open in Linear"
          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
        </button>
        {detail && (
          <span className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <PriorityIcon priority={detail.priority} />
              {priorityLabel(detail.priority)}
            </span>
            {detail.pr && <PrBadge pr={detail.pr} />}
          </span>
        )}
      </div>

      <h3 className="text-sm font-semibold leading-snug text-neutral-100">{issue.title}</h3>

      {detail ? (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <StateDot color={detail.state.color} />
              <span className="text-neutral-200">{detail.state.name}</span>
            </span>
            {detail.assignee && (
              <span className="flex items-center gap-1.5">
                <Avatar
                  name={detail.assignee.name}
                  avatarUrl={detail.assignee.avatarUrl}
                  className="size-4"
                />
                <span className="text-neutral-200">{detail.assignee.name}</span>
              </span>
            )}
          </div>

          {detail.description?.trim() && (
            <div className="text-xs">
              <Markdown>{detail.description.trim()}</Markdown>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      )}
    </div>
  );
}
