/**
 * Default keymap shared across the main process and renderer. These are the
 * built-in bindings; a user's `KeymapOverrides` (persisted under
 * `KEYBINDINGS_SETTING_KEY`) are layered on top at resolve time.
 *
 * Chord format: see `../types/shortcut`. `mod` = ⌘ on macOS / Ctrl elsewhere.
 */
import type { Keybinding } from '../types/shortcut';
import { ShortcutCommand } from '../enums/shortcut';

/** Settings-store key holding the user's `KeymapOverrides`. */
export const KEYBINDINGS_SETTING_KEY = 'keybindings';

/** Built-in bindings, one per command. */
export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  { command: ShortcutCommand.OpenCommandPalette, keys: 'mod+k' },
  { command: ShortcutCommand.ShowShortcutsHelp, keys: 'mod+/' },
  { command: ShortcutCommand.ToggleSidebar, keys: 'mod+b' },
  { command: ShortcutCommand.NewTab, keys: 'mod+t' },
  { command: ShortcutCommand.CloseTab, keys: 'mod+w' },
  { command: ShortcutCommand.NextTab, keys: 'mod+shift+]' },
  { command: ShortcutCommand.PrevTab, keys: 'mod+shift+[' },
  // Top-level views (Workspace / Terminals / …). ⌘J toggles/cycles forward, ⌘⇧J
  // back — a single easy key for a heavily-used switch (mirrors VS Code's panel
  // toggle). Numbers stay reserved for the inner chat tabs above.
  { command: ShortcutCommand.NextView, keys: 'mod+j' },
  { command: ShortcutCommand.PrevView, keys: 'mod+shift+j' },
  { command: ShortcutCommand.GoToTab1, keys: 'mod+1' },
  { command: ShortcutCommand.GoToTab2, keys: 'mod+2' },
  { command: ShortcutCommand.GoToTab3, keys: 'mod+3' },
  { command: ShortcutCommand.GoToTab4, keys: 'mod+4' },
  { command: ShortcutCommand.GoToTab5, keys: 'mod+5' },
  { command: ShortcutCommand.FocusInput, keys: 'mod+l' },
  { command: ShortcutCommand.InterruptSession, keys: 'mod+.' },
  { command: ShortcutCommand.PickWorkingFolder, keys: 'mod+o' },
];
