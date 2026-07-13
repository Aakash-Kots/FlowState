'use client';

import { ArrowDown, ArrowUp, GitBranch, RefreshCw } from 'lucide-react';
import { refreshStatus, useGit } from '@/lib/git';
import { cn } from '../ui/cn';
import { ChangeList } from './ChangeList';
import { CommitFooter } from './CommitFooter';
import { DiffPanel } from './DiffPanel';

/**
 * The worktree-scoped git changes manager: a branch/sync header strip over a
 * two-column body (changed files ▸ diff), with the commit toolbar pinned to the
 * bottom. Status loading + focus refresh are owned by `useGitSync` (mounted by
 * the always-present header button); this view just reads the store.
 */
export function GitView() {
  const status = useGit((s) => s.status);
  const loading = useGit((s) => s.loading);
  const error = useGit((s) => s.error);

  const changeCount = (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Branch + sync header strip */}
      <div className="flex items-center gap-3 border-b border-border bg-secondary px-3 py-1.5 text-xs">
        <span className="flex items-center gap-1.5 text-neutral-200">
          <GitBranch className="size-3.5 text-muted-foreground" />
          <span className="max-w-[16rem] truncate font-medium">{status?.branch || '—'}</span>
        </span>
        {status && (status.ahead > 0 || status.behind > 0) && (
          <span className="flex items-center gap-2 text-muted-foreground">
            {status.ahead > 0 && (
              <span className="flex items-center gap-0.5">
                <ArrowUp className="size-3" />
                {status.ahead}
              </span>
            )}
            {status.behind > 0 && (
              <span className="flex items-center gap-0.5">
                <ArrowDown className="size-3" />
                {status.behind}
              </span>
            )}
          </span>
        )}
        <span className="ml-auto text-muted-foreground">
          {changeCount === 0 ? 'No changes' : `${changeCount} changed`}
        </span>
        <button
          type="button"
          onClick={() => void refreshStatus()}
          title="Refresh"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Body: changes list ▸ diff */}
      {error ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-danger">
          {error}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <ChangeList />
          <DiffPanel />
        </div>
      )}

      <CommitFooter />
    </div>
  );
}
