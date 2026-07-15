/**
 * WorktreeEventsService — app-wide broadcast of worktree metadata changes (a
 * rename, or a branch reconciled from disk). The sidebar subscribes once and
 * patches its cached worktree list, so a rename from any trigger — the auto-title
 * flow, the manual sidebar action, or the in-chat agent running `git branch -m`
 * itself — updates every view, not just the tab that caused it.
 *
 * The service is the broadcast mechanism (mirrors `gitWatcherService`); the two
 * operations that actually mutate a worktree's name/branch and emit here —
 * `renameWorktree` and `reconcileWorktreeBranch` — live below it so every writer
 * funnels through one place.
 */
import { EventEmitter } from 'node:events';
import type { Workspace, WorktreeChange } from '@flowstate/shared';
import { getWorkspace, upsertWorkspace } from '../store';
import { slugifyTitle, worktreeService } from './worktree';

///////////////
// Constants //
///////////////

const CHANGE_EVENT = 'change';

//////////////////////////
// WorktreeEventsService //
//////////////////////////

class WorktreeEventsService {
  private readonly events = new EventEmitter();

  /** Subscribe to every worktree metadata change; returns an unsubscribe fn. */
  onChange(cb: (change: WorktreeChange) => void): () => void {
    this.events.on(CHANGE_EVENT, cb);
    return () => this.events.off(CHANGE_EVENT, cb);
  }

  /** Broadcast a change to all subscribers (the sidebar patches its store). */
  emit(change: WorktreeChange): void {
    this.events.emit(CHANGE_EVENT, change);
  }
}

export const worktreeEvents = new WorktreeEventsService();

////////////////
// Operations //
////////////////

/**
 * Rename a worktree: slug the new display name into a branch, rename the git
 * branch in place (`git branch -m`; the on-disk directory intentionally stays
 * put, so `worktreePath` and every live session/terminal remain valid), persist
 * name + branch, and broadcast. Skips the branch rename for Linear-linked
 * worktrees — their branch is the ticket's intentional name — so only the display
 * name changes. Best-effort on git: a failure keeps the old branch but still
 * applies the name. Returns the updated workspace, or null if it no longer exists.
 */
export async function renameWorktree(workspaceId: string, name: string): Promise<Workspace | null> {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;

  let branch = ws.branch;
  if (!ws.linearIssue) {
    try {
      branch = await worktreeService.renameBranch({
        repoRoot: ws.repoRoot,
        oldBranch: ws.branch,
        newBranch: slugifyTitle(name),
      });
    } catch (err) {
      console.warn('[worktree] branch rename failed', err);
    }
  }

  const updated = upsertWorkspace({ ...ws, name, branch });
  worktreeEvents.emit({ workspaceId: ws.id, name, branch });
  return updated;
}

/**
 * Reconcile a worktree's stored branch with the branch actually checked out on
 * disk — covers the in-chat agent renaming the branch itself (`git branch -m`),
 * which fires no FlowState event. A no-op when they already match. Leaves the
 * display name untouched: only the branch drifted.
 */
export function reconcileWorktreeBranch(workspaceId: string, actualBranch: string): void {
  const ws = getWorkspace(workspaceId);
  if (!ws || !actualBranch || ws.branch === actualBranch) return;
  upsertWorkspace({ ...ws, branch: actualBranch });
  worktreeEvents.emit({ workspaceId: ws.id, name: ws.name, branch: actualBranch });
}
