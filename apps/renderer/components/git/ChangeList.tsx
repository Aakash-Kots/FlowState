'use client';

import { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { GitFileStatus, type GitChange } from '@flowstate/shared';
import { discard, selectFile, useGit } from '@/lib/git';
import { cn } from '../ui/cn';

///////////////
// Constants //
///////////////

/** Single-letter badge + accent color per change status. */
const STATUS_BADGE: Record<GitFileStatus, { letter: string; className: string; label: string }> = {
  [GitFileStatus.Modified]: { letter: 'M', className: 'text-warn', label: 'Modified' },
  [GitFileStatus.Added]: { letter: 'A', className: 'text-success', label: 'Added' },
  [GitFileStatus.Deleted]: { letter: 'D', className: 'text-danger', label: 'Deleted' },
  [GitFileStatus.Renamed]: { letter: 'R', className: 'text-warn', label: 'Renamed' },
  [GitFileStatus.Untracked]: { letter: 'U', className: 'text-success', label: 'Untracked' },
  [GitFileStatus.Conflicted]: { letter: '!', className: 'text-danger', label: 'Conflicted' },
};

/////////////
// Helpers //
/////////////

/**
 * One row per changed path. Staging is automatic (commit stages everything), so
 * a file that happens to be partly staged is shown once — preferring its
 * working-tree side so the diff reflects what's on disk.
 */
function mergeChanges(staged: GitChange[], unstaged: GitChange[]): GitChange[] {
  const byPath = new Map<string, GitChange>();
  for (const c of staged) byPath.set(c.path, c);
  for (const c of unstaged) byPath.set(c.path, c); // working-tree side wins
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

///////////////////
// Sub-components //
///////////////////

/** A path shown as its `basename` over a dimmed, truncating directory. */
function PathLabel({ path }: { path: string }) {
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash) : '';
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-1.5" title={path}>
      <span className="shrink-0 truncate text-neutral-200">{name}</span>
      {dir && <span className="truncate text-[11px] text-muted-foreground">{dir}</span>}
    </span>
  );
}

/** One changed file: status badge, path, +/- counts, and a hover discard action. */
function ChangeRow({ change }: { change: GitChange }) {
  const selected = useGit((s) => s.selected);
  const isSelected = selected?.path === change.path;
  const badge = STATUS_BADGE[change.status];

  return (
    <button
      type="button"
      onClick={() => void selectFile(change.path, change.staged)}
      className={cn(
        'group flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors',
        isSelected ? 'bg-accent text-neutral-100' : 'hover:bg-muted',
      )}
    >
      <span className={cn('w-3 shrink-0 text-center font-semibold', badge.className)} title={badge.label}>
        {badge.letter}
      </span>
      <PathLabel path={change.path} />

      {/* Counts, hidden on hover to make room for the discard action. */}
      <span className="flex shrink-0 items-center gap-1 tabular-nums text-[11px] text-muted-foreground group-hover:hidden">
        {change.insertions > 0 && <span className="text-success">+{change.insertions}</span>}
        {change.deletions > 0 && <span className="text-danger">−{change.deletions}</span>}
      </span>

      <span className="hidden shrink-0 items-center group-hover:flex">
        <span
          role="button"
          tabIndex={-1}
          title="Discard changes"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Discard changes to ${change.path}? This cannot be undone.`)) {
              void discard([change.path]);
            }
          }}
          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-danger"
        >
          <RotateCcw className="size-3" />
        </span>
      </span>
    </button>
  );
}

/**
 * The left column: every changed file in one flat list. Selecting a file loads
 * its diff into the panel; there is no staging step — commit stages everything.
 */
export function ChangeList() {
  const status = useGit((s) => s.status);
  const loading = useGit((s) => s.loading);

  const changes = useMemo(
    () => (status ? mergeChanges(status.staged, status.unstaged) : []),
    [status],
  );

  return (
    <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border">
      {changes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          {loading && !status ? 'Loading changes…' : 'No uncommitted changes'}
        </div>
      ) : (
        <div className="flex flex-col py-1">
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Changes
            </span>
            <span className="text-[11px] text-muted-foreground">{changes.length}</span>
          </div>
          <div className="flex flex-col px-1">
            {changes.map((c) => (
              <ChangeRow key={c.path} change={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
