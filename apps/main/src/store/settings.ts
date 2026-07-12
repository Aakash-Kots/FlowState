/**
 * A small JSON key/value store for app settings (window bounds, UI prefs).
 * Backed by the `settings` table — a single source of truth on disk.
 */
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { settings } from './schema';

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

export interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

const WINDOW_BOUNDS_KEY = 'window.bounds';

export function getWindowBounds(): WindowBounds | null {
  return getSetting<WindowBounds>(WINDOW_BOUNDS_KEY);
}

export function setWindowBounds(bounds: WindowBounds): void {
  setSetting(WINDOW_BOUNDS_KEY, bounds);
}
