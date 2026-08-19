/**
 * Archive lifecycle — the teardown recipe for a worktree-workspace plus the
 * background reaper that force-removes archived worktrees once their retention
 * grace period elapses. Archiving (in the worktree router) only sets a
 * timestamp + hides the row; the on-disk worktree lingers until a sweep here
 * deletes it. Sweeps run once on boot (catching delays that elapsed while the
 * app was closed), right after an archive so short delays act at once, and via
 * a one-shot timer re-armed only while archived rows remain — with nothing
 * archived the reaper holds no timer at all. The reaper is purely time-based on
 * `archivedAt` — it never re-polls GitHub; merge is verified when the user
 * archives.
 */
import type { Workspace } from '@flowstate/shared';
import { ARCHIVE_RETENTION_MS } from '../lib/constants/worktree';
import {
  deleteWorkspace,
  getArchiveRetention,
  listArchivedWorkspaces,
  listTabs,
  listTerminalTabs,
} from '../store';
import { claudeService } from './claude';
import { evictGitCaches } from './git';
import { evictGithubCaches } from './github';
import { terminalService } from './terminal';
import { worktreeService } from './worktree';

///////////////
// Constants //
///////////////

/** Longest the reaper waits before re-checking pending deletions. */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Shortest re-arm delay. Bounds the retry cadence after a failed teardown (its
 * due time is already in the past) so the reaper can't spin in a hot loop.
 */
const MIN_RESCHEDULE_MS = 60 * 1000;

/////////////
// Helpers //
/////////////

/**
 * Tear a worktree-workspace down: close its Claude sessions + terminals, remove
 * the git worktree from disk, delete the SDK's on-disk transcript dir, and
 * delete its row (cascading tabs + transcripts). `force` discards uncommitted
 * changes. Shared by the manual `remove` flow and the reaper; callers guard
 * dirtiness before opting out of `force`.
 */
export async function teardownWorkspace(ws: Workspace, force: boolean): Promise<void> {
  for (const tab of listTabs(ws.id)) claudeService.closeSession(tab.id);
  for (const term of listTerminalTabs(ws.id)) terminalService.kill(term.id);
  await worktreeService.remove({ repoRoot: ws.repoRoot, worktreePath: ws.worktreePath, force });
  await claudeService.removeTranscriptDir(ws.worktreePath);
  deleteWorkspace(ws.id);
  evictGitCaches(ws.worktreePath);
  evictGithubCaches(ws.worktreePath);
}

//////////////////////
// Reaper service //
//////////////////////

class ArchiveReaperService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sweeping = false;

  /** Run the boot catch-up sweep; it re-arms itself while archived rows remain. */
  start(): void {
    void this.sweep();
  }

  /** Stop the reaper (app quit). */
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * Force-remove every archived worktree whose retention grace period has
   * elapsed. Re-entrancy-guarded so an in-flight sweep isn't doubled by the
   * post-archive trigger. One failed teardown never stalls the rest. Every
   * sweep ends by re-arming (or parking) the one-shot timer.
   */
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const graceMs = ARCHIVE_RETENTION_MS[getArchiveRetention()];
      const now = Date.now();
      for (const ws of listArchivedWorkspaces()) {
        if (!ws.archivedAt) continue;
        if (now - Date.parse(ws.archivedAt) < graceMs) continue;
        try {
          await teardownWorkspace(ws, true);
        } catch {
          // Leave the row archived; the next sweep retries.
        }
      }
    } finally {
      this.sweeping = false;
      this.scheduleNext();
    }
  }

  /**
   * One-shot re-arm: wake for the earliest pending deletion, clamped between
   * the retry floor and the periodic ceiling. With no archived rows left, no
   * timer runs at all — archiving and retention changes both poke `sweep()`,
   * which restarts the cycle.
   */
  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const graceMs = ARCHIVE_RETENTION_MS[getArchiveRetention()];
    const dueTimes = listArchivedWorkspaces()
      .filter((ws) => ws.archivedAt)
      .map((ws) => Date.parse(ws.archivedAt as string) + graceMs);
    if (dueTimes.length === 0) return;
    const wait = Math.min(
      Math.max(Math.min(...dueTimes) - Date.now(), MIN_RESCHEDULE_MS),
      SWEEP_INTERVAL_MS,
    );
    this.timer = setTimeout(() => void this.sweep(), wait);
  }
}

/** Shared singleton — started from `index.ts`, poked by the worktree router. */
export const archiveReaperService = new ArchiveReaperService();
