/**
 * FullScreenService — the main-process half of the window full-screen signal.
 *
 * The glassmorphic sidebar renders at partial opacity over the macOS vibrancy
 * layer, so in full-screen the wallpaper bleeds through and tints it. The
 * renderer subscribes to `app.onFullScreen` and bumps the sidebar to near-opaque
 * while full-screen; this service is the event bus that carries the transitions.
 * The window's `enter-full-screen`/`leave-full-screen` events call `set()`.
 */
import { EventEmitter } from 'node:events';

///////////////
// Constants //
///////////////

const CHANGE_EVENT = 'change';

export class FullScreenService {
  private readonly events = new EventEmitter();
  private current = false;

  /** Current full-screen state. */
  get(): boolean {
    return this.current;
  }

  /** Update state; emits only on an actual transition. */
  set(isFullScreen: boolean): void {
    if (this.current === isFullScreen) return;
    this.current = isFullScreen;
    this.events.emit(CHANGE_EVENT, isFullScreen);
  }

  /** Subscribe to full-screen transitions. Returns an unsubscribe. */
  onChange(listener: (isFullScreen: boolean) => void): () => void {
    this.events.on(CHANGE_EVENT, listener);
    return () => this.events.off(CHANGE_EVENT, listener);
  }
}

/** App-wide singleton. */
export const fullScreenService = new FullScreenService();
