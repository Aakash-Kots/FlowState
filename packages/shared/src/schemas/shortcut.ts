/**
 * Runtime validation for the keyboard-shortcut domain. Mirrors
 * `../types/shortcut`; annotated with the type it validates so the two cannot
 * silently drift. Applied at the `shortcuts.setKeymap`/`getKeymap` tRPC boundary
 * and when reading persisted overrides back out of the settings store.
 */
import { z } from 'zod';
import { ShortcutCommand } from '../enums/shortcut';
import type { KeymapOverrides } from '../types/shortcut';

export const keymapOverridesSchema: z.ZodType<KeymapOverrides> = z.record(
  z.nativeEnum(ShortcutCommand),
  z.string(),
);
