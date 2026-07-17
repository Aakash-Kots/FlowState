/**
 * GitWatcherService — watches each active worktree's files and emits a debounced
 * "changed" signal so the renderer can refresh git status the instant something
 * changes, instead of only on window focus or a manual refresh. Watchers are
 * ref-counted per workspace: the first subscriber starts one, the last one to
 * leave tears it down (so parallel worktrees don't leak watchers).
 *
 * macOS (this app's target) and Windows support recursive `fs.watch` natively;
 * on a platform that doesn't, the watcher degrades to a no-op and the renderer's
 * focus/open refresh still keeps status reasonably fresh.
 */
import { EventEmitter } from 'node:events';
import { watch, type FSWatcher } from 'node:fs';
import { sep } from 'node:path';
import { getWorkspace } from '../store';

///////////////
// Constants //
///////////////

/**
 * Coalesce a burst of filesystem events into one emit per this window (ms).
 * Each emit makes the renderer re-run `git.status` (several git subprocesses),
 * so during an active agent turn — which writes files continuously — a tighter
 * window just multiplies that cost with no visible benefit. ~450ms keeps the
 * changes view feeling live while collapsing write bursts into far fewer refreshes.
 */
const DEBOUNCE_MS = 450;

/////////////
// Helpers //
/////////////

/**
 * Whether a changed path (relative to the worktree root) is noise we shouldn't
 * refresh on. Skips `node_modules` and git's internal churn (objects, logs, lock
 * files) while still reflecting terminal-driven staging/commits/checkouts via
 * `.git/index`, `.git/HEAD`, and `.git/refs`.
 */
function isNoise(relPath: string): boolean {
  const parts = relPath.split(sep);
  if (parts.includes('node_modules')) return true;
  const gitIdx = parts.indexOf('.git');
  if (gitIdx !== -1) {
    const head = parts[gitIdx + 1];
    return !(head === 'index' || head === 'HEAD' || head === 'refs');
  }
  return false;
}

//////////////////////
// GitWatcherService //
//////////////////////

type WatchEntry = {
  watcher: FSWatcher;
  refCount: number;
  timer: NodeJS.Timeout | null;
};

class GitWatcherService {
  private readonly events = new EventEmitter();
  private readonly watchers = new Map<string, WatchEntry>();

  /** Subscribe to a worktree's file changes; returns an unsubscribe function. */
  onChange(workspaceId: string, cb: () => void): () => void {
    this.events.on(workspaceId, cb);
    this.acquire(workspaceId);
    return () => {
      this.events.off(workspaceId, cb);
      this.release(workspaceId);
    };
  }

  private acquire(workspaceId: string): void {
    const existing = this.watchers.get(workspaceId);
    if (existing) {
      existing.refCount += 1;
      return;
    }
    const ws = getWorkspace(workspaceId);
    if (!ws) return;

    let watcher: FSWatcher;
    try {
      // `persistent: false` — don't keep the process alive on the watcher's
      // account (Electron's own loop does); it must never block app quit.
      watcher = watch(ws.worktreePath, { recursive: true, persistent: false });
    } catch (err) {
      // Recursive watch unsupported here — degrade to no-op.
      console.warn('[gitWatcher] watch failed', err);
      return;
    }

    const entry: WatchEntry = { watcher, refCount: 1, timer: null };
    watcher.on('change', (_event, filename) => {
      const rel = typeof filename === 'string' ? filename : filename?.toString();
      if (rel && isNoise(rel)) return;
      this.schedule(workspaceId, entry);
    });
    watcher.on('error', () => {});
    this.watchers.set(workspaceId, entry);
  }

  private release(workspaceId: string): void {
    const entry = this.watchers.get(workspaceId);
    if (!entry) return;
    entry.refCount -= 1;
    if (entry.refCount > 0) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.watcher.close();
    this.watchers.delete(workspaceId);
  }

  /** Trailing throttle: the first event in a window schedules a single emit. */
  private schedule(workspaceId: string, entry: WatchEntry): void {
    if (entry.timer) return;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      this.events.emit(workspaceId);
    }, DEBOUNCE_MS);
  }
}

export const gitWatcherService = new GitWatcherService();
