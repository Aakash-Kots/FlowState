/**
 * Keyboard-shortcut domain types. Validation lives in `../schemas/shortcut`.
 *
 * A `KeyChord` is the cross-process wire format for a key combination: lowercase
 * tokens joined by `+`, modifiers first, then exactly one key token, e.g.
 * `"mod+shift+]"`. `mod` is the platform primary modifier (⌘ on macOS, Ctrl
 * elsewhere). Keeping chords as plain strings lets both the DOM matcher
 * (renderer) and the Electron accelerator builder (main) share one contract
 * without leaking DOM/Electron concerns into shared.
 */
import type { ShortcutCommand } from '../enums/shortcut';

/** A normalized key-combination string, e.g. `"mod+t"` or `"mod+shift+["`. */
export type KeyChord = string;

/** A command bound to a chord. */
export type Keybinding = {
  command: ShortcutCommand;
  keys: KeyChord;
};

/**
 * User overrides layered over `DEFAULT_KEYBINDINGS` — only commands the user has
 * rebound appear here. Persisted in the `settings` store and validated at the
 * tRPC boundary.
 */
export type KeymapOverrides = Partial<Record<ShortcutCommand, KeyChord>>;
