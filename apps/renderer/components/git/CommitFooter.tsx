'use client';

import type { KeyboardEvent } from 'react';
import { ChevronUp, GitPullRequestArrow } from 'lucide-react';
import { ConnStatus } from '@/lib/enums/connection';
import {
  commit,
  commitAndCreatePr,
  commitAndPush,
  fetchRemote,
  pull,
  push,
  setDescription,
  setSummary,
  useGit,
} from '@/lib/git';
import { Button } from '../ui/Button';
import { DropdownItem, DropdownMenu } from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { StatusPill } from '../ui/StatusPill';

/**
 * The pinned commit toolbar. Summary + optional description feed the commit; the
 * split `Commit ▾` button also offers Commit & Push / Commit & Create PR. Sync
 * actions (Fetch / Pull / Push) sit alongside. Push/PR are disabled when the
 * worktree has no GitHub remote. ⌘↵ in either field commits.
 */
export function CommitFooter() {
  const status = useGit((s) => s.status);
  const summary = useGit((s) => s.summary);
  const description = useGit((s) => s.description);
  const busy = useGit((s) => s.busy);
  const actionError = useGit((s) => s.actionError);

  // Every changed path (staging is automatic on commit), counted once.
  const changeCount = status
    ? new Set([...status.staged, ...status.unstaged].map((c) => c.path)).size
    : 0;
  const hasRemote = status?.hasRemote ?? false;
  const canCommit = summary.trim().length > 0 && changeCount > 0 && !busy;
  const remoteTitle = hasRemote ? undefined : 'This worktree has no GitHub remote.';

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canCommit) {
      e.preventDefault();
      void commit();
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-secondary px-3 py-2.5">
      {actionError && <p className="text-xs text-danger">{actionError}</p>}

      <Input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Summary (required)"
        disabled={busy}
        className="h-11"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Description (optional)"
        disabled={busy}
        rows={4}
        className="min-h-[6rem] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />

      <div className="flex items-center gap-2">
        <StatusPill
          status={changeCount > 0 ? ConnStatus.Connected : ConnStatus.Idle}
          label={`${changeCount} ${changeCount === 1 ? 'change' : 'changes'}`}
        />

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            onClick={() => void fetchRemote()}
            disabled={!hasRemote || busy}
            title={remoteTitle}
            className="px-2 py-1 text-xs"
          >
            Fetch
          </Button>
          <Button
            variant="ghost"
            onClick={() => void pull()}
            disabled={!hasRemote || busy}
            title={remoteTitle}
            className="px-2 py-1 text-xs"
          >
            Pull
          </Button>
          <Button
            variant="secondary"
            onClick={() => void push()}
            disabled={!hasRemote || busy}
            title={remoteTitle}
            className="px-2.5 py-1 text-xs"
          >
            Push
          </Button>

          {/* Commit split button: Commit / & Push / & Create PR. */}
          <div className="flex items-center">
            <Button
              onClick={() => void commit()}
              disabled={!canCommit}
              className="rounded-r-none px-3 py-1.5 text-xs"
            >
              Commit{changeCount > 0 ? ` ${changeCount}` : ''}
            </Button>
            <DropdownMenu
              align="end"
              disabled={!canCommit}
              triggerClassName="h-[30px] rounded-l-none rounded-r-md border-l border-primary-foreground/20 bg-primary px-1.5 text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              trigger={<ChevronUp className="size-3.5" />}
            >
              {(close) => (
                <>
                  <DropdownItem
                    onSelect={() => {
                      void commitAndPush();
                      close();
                    }}
                    disabled={!hasRemote}
                  >
                    Commit &amp; Push
                  </DropdownItem>
                  <DropdownItem
                    onSelect={() => {
                      void commitAndCreatePr();
                      close();
                    }}
                    disabled={!hasRemote}
                  >
                    <GitPullRequestArrow className="size-3.5" />
                    Commit &amp; Create PR
                  </DropdownItem>
                </>
              )}
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
