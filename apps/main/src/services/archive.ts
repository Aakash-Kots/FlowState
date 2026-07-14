/**
 * Archive lifecycle — the teardown recipe for a worktree-workspace plus the
 * background reaper that force-removes archived worktrees once their retention
 * grace period elapses. Archiving (in the worktree router) only sets a
 * timestamp + hides the row; the on-disk worktree lingers until a sweep here
 * deletes it. Sweeps run on a timer, once on boot (catching delays that elapsed
 * while the app was closed), and right after an archive so short delays act at
 * once. The reaper is purely time-based on `archivedAt` — it never re-polls
 * GitHub; merge is verified when the user archives.
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
import { terminalService } from './terminal';
import { worktreeService } from './worktree';

///////////////
// Constants //
///////////////

/** How often the reaper re-scans archived worktrees for due deletions. */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

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
}

//////////////////////
// Reaper service //
//////////////////////

class ArchiveReaperService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private sweeping = false;

  /** Start the periodic reaper and run one immediate catch-up sweep. */
  start(): void {
    if (this.timer) return;
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
  }

  /** Stop the reaper (app quit). */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Force-remove every archived worktree whose retention grace period has
   * elapsed. Re-entrancy-guarded so an in-flight sweep isn't doubled by the
   * post-archive trigger. One failed teardown never stalls the rest.
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
    }
  }
}

/** Shared singleton — started from `index.ts`, poked by the worktree router. */
export const archiveReaperService = new ArchiveReaperService();
