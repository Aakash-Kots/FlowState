'use client';

import { useState } from 'react';
import { GitPullRequestArrow } from 'lucide-react';
import {
  autoCommitSummary,
  commitAndPushWith,
  createPr,
  useGit,
  useGitSync,
} from '@/lib/git';
import { Button } from '../ui/Button';
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

//////////////////
// Header button //
//////////////////

/**
 * The top-right header action, driven by the active worktree's git status:
 * uncommitted changes → "Commit and Push" (one click auto-drafts the message for
 * a single file, or a popover form for several); a clean tree → "Create PR"
 * against the worktree's base branch. Disabled without a GitHub remote.
 */
export function GitHeaderButton() {
  useGitSync();
  const status = useGit((s) => s.status);
  const busy = useGit((s) => s.busy);
  const actionError = useGit((s) => s.actionError);

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

  // No remote: nothing here can push, so surface a single disabled button.
  if (!hasRemote) {
    return (
      <div className="flex items-center gap-3">
        {error}
        <Button variant="secondary" disabled title={NO_REMOTE} className="px-3 py-1.5 text-xs">
          {changeCount > 0 ? 'Commit and Push' : 'Create PR'}
        </Button>
      </div>
    );
  }

  // Clean tree → open a PR against the base branch.
  if (changeCount === 0) {
    return (
      <div className="flex items-center gap-3">
        {error}
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
      </div>
    );
  }

  // A single file → one click, auto-drafted message.
  if (changeCount === 1) {
    return (
      <div className="flex items-center gap-3">
        {error}
        <Button
          onClick={() => void commitAndPushWith(autoCommitSummary(unique[0]))}
          disabled={busy}
          className="px-3 py-1.5 text-xs"
        >
          Commit and Push
        </Button>
      </div>
    );
  }

  // Several files → a small form for the commit message.
  return (
    <div className="flex items-center gap-3">
      {error}
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
    </div>
  );
}
