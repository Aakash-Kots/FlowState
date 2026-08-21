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
import { ClaudeSessionState } from '@flowstate/shared';
import { getWorkspace } from '../store';
import { claudeService } from './claude';
import { windowStateService } from './windowState';

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

/**
 * Debounce window while a Claude turn is running in the workspace. Agent turns
 * write files continuously for minutes; nobody needs sub-second status during
 * one, and each emit costs several git subprocess spawns — widen to cut the
 * spawn rate ~4x. The final Idle-edge write burst still lands within this
 * window of the turn ending.
 */
const ACTIVE_TURN_DEBOUNCE_MS = 2_000;

/**
 * Directory names whose contents never belong in the changes view: dependency
 * trees and build output. `fs.watch(recursive)` can't exclude them at the OS
 * level, but dropping their events here keeps them from scheduling `git.status`
 * refreshes. A repo whose *source* lives in one of these goes stale until the
 * next focus refresh — the same accepted tradeoff as `node_modules`.
 */
const NOISE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'out',
  'build',
  '.turbo',
  '.cache',
  'coverage',
  '__pycache__',
  '.venv',
  'target',
]);

/////////////
// Helpers //
/////////////

/**
 * Whether a changed path (relative to the worktree root) is noise we shouldn't
 * refresh on. Skips dependency/build dirs (`NOISE_DIRS`) and git's internal
 * churn (objects, logs, lock files) while still reflecting terminal-driven
 * staging/commits/checkouts via `.git/index`, `.git/HEAD`, and `.git/refs`.
 */
function isNoise(relPath: string): boolean {
  const parts = relPath.split(sep);
  const gitIdx = parts.indexOf('.git');
  if (gitIdx !== -1) {
    const head = parts[gitIdx + 1];
    return !(head === 'index' || head === 'HEAD' || head === 'refs');
  }
  return parts.some((p) => NOISE_DIRS.has(p));
}

//////////////////////
// GitWatcherService //
//////////////////////

type WatchEntry = {
  watcher: FSWatcher;
  refCount: number;
  timer: NodeJS.Timeout | null;
  /** A change arrived while the window was hidden; emit once on reactivation. */
  pendingWhileHidden: boolean;
};

class GitWatcherService {
  private readonly events = new EventEmitter();
  private readonly watchers = new Map<string, WatchEntry>();
  /** Tabs currently mid-turn, grouped by workspace — drives the wider debounce. */
  private readonly runningTabs = new Map<string, Set<string>>();

  constructor() {
    // Track which workspaces have a Claude turn in flight so `schedule` can
    // widen its debounce. (claude.ts doesn't import this module — no cycle.)
    claudeService.onAnyStateChange(({ tabId, workspaceId, state }) => {
      const tabs = this.runningTabs.get(workspaceId) ?? new Set<string>();
      if (state === ClaudeSessionState.Running) tabs.add(tabId);
      else tabs.delete(tabId);
      if (tabs.size > 0) this.runningTabs.set(workspaceId, tabs);
      else this.runningTabs.delete(workspaceId);
    });

    // Deferred-while-hidden changes flush the moment the window is visible
    // again, so the changes view catches up without waiting for a focus event.
    windowStateService.onChange((isActive) => {
      if (!isActive) return;
      for (const [workspaceId, entry] of this.watchers) {
        if (!entry.pendingWhileHidden) continue;
        entry.pendingWhileHidden = false;
        this.schedule(workspaceId, entry);
      }
    });
  }

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

    const entry: WatchEntry = { watcher, refCount: 1, timer: null, pendingWhileHidden: false };
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

  /**
   * Trailing throttle: the first event in a window schedules a single emit.
   * While the window is hidden or the machine asleep, nothing schedules — the
   * change is flagged and emitted once on reactivation instead (each emit costs
   * git subprocess spawns nobody can see the result of). Mid-turn workspaces
   * get the wider window.
   */
  private schedule(workspaceId: string, entry: WatchEntry): void {
    if (!windowStateService.isActive()) {
      entry.pendingWhileHidden = true;
      return;
    }
    if (entry.timer) return;
    const debounce = this.runningTabs.has(workspaceId) ? ACTIVE_TURN_DEBOUNCE_MS : DEBOUNCE_MS;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      this.events.emit(workspaceId);
    }, debounce);
  }
}

export const gitWatcherService = new GitWatcherService();
