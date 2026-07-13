/**
 * A small JSON key/value store for app settings (window bounds, UI prefs).
 * Backed by the `settings` table — a single source of truth on disk.
 */
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { settings } from './schema';

///////////
// Types //
///////////

type WindowBounds = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};

///////////////
// Constants //
///////////////

const WINDOW_BOUNDS_KEY = 'window.bounds';
const SOUND_ENABLED_KEY = 'notifications.soundEnabled';

export function getSetting<T>(key: string): T | null {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  return row ? (JSON.parse(row.value) as T) : null;
}

export function setSetting<T>(key: string, value: T): void {
  const serialized = JSON.stringify(value);
  getDb()
    .insert(settings)
    .values({ key, value: serialized })
    .onConflictDoUpdate({ target: settings.key, set: { value: serialized } })
    .run();
}

export function getWindowBounds(): WindowBounds | null {
  return getSetting<WindowBounds>(WINDOW_BOUNDS_KEY);
}

export function setWindowBounds(bounds: WindowBounds): void {
  setSetting(WINDOW_BOUNDS_KEY, bounds);
}

/** Whether a sound plays when a background agent finishes a turn (default on). */
export function getSoundEnabled(): boolean {
  return getSetting<boolean>(SOUND_ENABLED_KEY) ?? true;
}

export function setSoundEnabled(enabled: boolean): void {
  setSetting(SOUND_ENABLED_KEY, enabled);
}
