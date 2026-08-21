/**
 * WindowStateService — the main-process view of "is anyone able to see the app
 * right now". Renderer-side pollers already pause themselves via
 * `useWindowActive`, but main-side background work (file watchers, timers) is
 * outside Chromium's throttling — this service is the signal they consult to
 * skip or defer work while the window is hidden/minimized or the machine is
 * asleep. `index.ts` feeds it from BrowserWindow + powerMonitor events.
 */
import { EventEmitter } from 'node:events';

///////////////
// Constants //
///////////////

const CHANGE_EVENT = 'change';

export class WindowStateService {
  private readonly events = new EventEmitter();
  private visible = true;
  private focused = true;
  private suspended = false;

  /**
   * Whether background work on the window's behalf is worth doing now: the
   * window is visible (focus doesn't matter — a visible-but-blurred window
   * still shows live state) and the machine is awake.
   */
  isActive(): boolean {
    return this.visible && !this.suspended;
  }

  /** Whether the window is focused (for work only worth doing when watched). */
  isFocused(): boolean {
    return this.focused && this.isActive();
  }

  setVisible(visible: boolean): void {
    this.update({ visible });
  }

  setFocused(focused: boolean): void {
    this.update({ focused });
  }

  setSuspended(suspended: boolean): void {
    this.update({ suspended });
  }

  /** Subscribe to active-state transitions. Returns an unsubscribe. */
  onChange(listener: (isActive: boolean) => void): () => void {
    this.events.on(CHANGE_EVENT, listener);
    return () => this.events.off(CHANGE_EVENT, listener);
  }

  /** Apply a patch; emits only when the derived active state transitions. */
  private update(patch: Partial<{ visible: boolean; focused: boolean; suspended: boolean }>): void {
    const wasActive = this.isActive();
    if (patch.visible !== undefined) this.visible = patch.visible;
    if (patch.focused !== undefined) this.focused = patch.focused;
    if (patch.suspended !== undefined) this.suspended = patch.suspended;
    const isActive = this.isActive();
    if (isActive !== wasActive) this.events.emit(CHANGE_EVENT, isActive);
  }
}

/** App-wide singleton. */
export const windowStateService = new WindowStateService();
