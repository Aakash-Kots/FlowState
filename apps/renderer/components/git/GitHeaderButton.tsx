'use client';

import { useState, type ReactNode } from 'react';
import { CheckCircle2, GitPullRequestArrow, Loader2, Trash2, XCircle } from 'lucide-react';
import { PrChecks, PrState, type PrStatus } from '@flowstate/shared';
import {
  autoCommitSummary,
  commitAndPushWith,
  createPr,
  useGit,
  useGitSync,
} from '@/lib/git';
import { removeWorktree, useProjects } from '@/lib/projects';
import { trpc } from '@/lib/trpc';
import { useWorkspace } from '@/lib/workspace';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { DropdownMenu } from '../ui/dropdown-menu';
import { Input } from '../ui/input';

///////////////
// Constants //
///////////////

// Trigger styled to read as a primary Button (the DropdownMenu wraps it in a <button>).
const PRIMARY_TRIGGER =
  'bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-1 focus-visible:ring-ring/60 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100';

const NO_REMOTE = 'This worktree has no GitHub remote.';

/////////////
// Helpers //
/////////////

/**
 * A title + optional description form shown in the header popover, shared by the
 * multi-file commit flow and the Create-PR flow. Local state so it's independent
 * of the Git view's commit fields; resets each time the popover opens.
 */
function ActionForm({
  titlePlaceholder,
  submitLabel,
  busy,
  onSubmit,
  onDone,
}: {
  titlePlaceholder: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (title: string, description?: string) => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const canSubmit = title.trim().length > 0 && !busy;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(title.trim(), description.trim() || undefined);
    onDone();
  };

  return (
    <div className="flex w-72 flex-col gap-2 p-1.5">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
        }}
        placeholder={titlePlaceholder}
        disabled={busy}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
        }}
        placeholder="Description (optional)"
        disabled={busy}
        rows={4}
        className="min-h-[5rem] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Button onClick={submit} disabled={!canSubmit} className="px-3 py-1.5 text-xs">
        {submitLabel}
      </Button>
    </div>
  );
}

/** Remove the active worktree, looking its Workspace up from the projects store. */
function deleteActiveWorktree(workspaceId: string): void {
  const worktree = Object.values(useProjects.getState().worktrees)
    .flat()
    .find((w) => w.id === workspaceId);
  if (worktree) void removeWorktree(worktree);
}

/**
 * A compact CI/merge badge for an open PR, linking out to GitHub: pending checks
 * ("N checks pending"), a failure, a merge conflict, or a green "Ready to merge".
 */
function PrBadge({ pr }: { pr: PrStatus }) {
  let icon: ReactNode;
  let label: string;
  let tone: string;

  if (pr.checks === PrChecks.Pending) {
    icon = <Loader2 className="size-3.5 animate-spin" />;
    label = `${pr.pending} check${pr.pending === 1 ? '' : 's'} pending`;
    tone = 'text-amber-500';
  } else if (pr.checks === PrChecks.Failing) {
    icon = <XCircle className="size-3.5" />;
    label = 'Checks failing';
    tone = 'text-danger';
  } else if (!pr.mergeable) {
    icon = <XCircle className="size-3.5" />;
    label = 'Merge conflicts';
    tone = 'text-amber-500';
  } else {
    icon = <CheckCircle2 className="size-3.5" />;
    label = 'Ready to merge';
    tone = 'text-green-500';
  }

  return (
    <button
      type="button"
      onClick={() => void trpc().app.openExternal.mutate({ url: pr.url }).catch(() => {})}
      title={`PR #${pr.number} — open on GitHub`}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium transition-opacity hover:opacity-80',
        tone,
      )}
    >
      {icon}
      {label}
    </button>
  );
}

//////////////////
// Header button //
//////////////////

/**
 * The top-right header action + PR status, driven by the active worktree's git
 * status and any PR on its branch:
 * - uncommitted changes → "Commit and Push" (one click auto-drafts the message
 *   for a single file, or a popover form for several);
 * - a clean tree with no PR yet → "Create PR" against the base branch;
 * - an open PR → its CI/merge badge ("N checks pending" / "Ready to merge"),
 *   alongside the commit button when there are still local changes;
 * - a merged PR → "Delete Worktree" to clean up.
 * Disabled without a GitHub remote.
 */
export function GitHeaderButton() {
  useGitSync();
  const status = useGit((s) => s.status);
  const pr = useGit((s) => s.pr);
  const busy = useGit((s) => s.busy);
  const actionError = useGit((s) => s.actionError);
  const workspaceId = useWorkspace((s) => s.workspaceId);

  if (!status) return null;

  // Every changed path (staging is automatic on commit), counted once.
  const changes = [...status.unstaged, ...status.staged];
  const seen = new Set<string>();
  const unique = changes.filter((c) => (seen.has(c.path) ? false : seen.add(c.path)));
  const changeCount = unique.length;
  const hasRemote = status.hasRemote;

  const error = actionError && (
    <span className="max-w-[16rem] truncate text-xs text-danger" title={actionError}>
      {actionError}
    </span>
  );

  // A merged PR: the branch has landed, so the only useful action is cleanup.
  if (pr?.state === PrState.Merged) {
    return (
      <div className="flex items-center gap-3">
        {error}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => deleteActiveWorktree(workspaceId)}
          className="px-3 py-1.5 text-xs"
        >
          <Trash2 className="size-3.5" />
          Delete Worktree
        </Button>
      </div>
    );
  }

  const badge = pr?.state === PrState.Open ? <PrBadge pr={pr} /> : null;

  // The trailing action button, if any, depends on the working tree + PR.
  let action: ReactNode = null;
  if (!hasRemote) {
    // Nothing here can push, so surface a single disabled button.
    action = (
      <Button variant="secondary" disabled title={NO_REMOTE} className="px-3 py-1.5 text-xs">
        {changeCount > 0 ? 'Commit and Push' : 'Create PR'}
      </Button>
    );
  } else if (changeCount === 1) {
    // A single file → one click, auto-drafted message.
    action = (
      <Button
        onClick={() => void commitAndPushWith(autoCommitSummary(unique[0]))}
        disabled={busy}
        className="px-3 py-1.5 text-xs"
      >
        Commit and Push
      </Button>
    );
  } else if (changeCount > 1) {
    // Several files → a small form for the commit message.
    action = (
      <DropdownMenu
        align="end"
        placement="bottom"
        disabled={busy}
        triggerClassName={PRIMARY_TRIGGER}
        trigger={<>Commit and Push</>}
      >
        {(close) => (
          <ActionForm
            titlePlaceholder="Summary (required)"
            submitLabel="Commit and Push"
            busy={busy}
            onSubmit={(summary, description) => void commitAndPushWith(summary, description)}
            onDone={close}
          />
        )}
      </DropdownMenu>
    );
  } else if (!pr) {
    // Clean tree, no PR yet → open one against the base branch.
    action = (
      <DropdownMenu
        align="end"
        placement="bottom"
        disabled={busy}
        triggerClassName={PRIMARY_TRIGGER}
        trigger={
          <>
            <GitPullRequestArrow className="size-3.5" />
            Create PR
          </>
        }
      >
        {(close) => (
          <ActionForm
            titlePlaceholder="PR title (required)"
            submitLabel="Create PR"
            busy={busy}
            onSubmit={(title, body) => void createPr(title, body)}
            onDone={close}
          />
        )}
      </DropdownMenu>
    );
  }
  // Else: clean tree with an open PR → the badge alone is enough.

  return (
    <div className="flex items-center gap-3">
      {error}
      {badge}
      {action}
    </div>
  );
}
