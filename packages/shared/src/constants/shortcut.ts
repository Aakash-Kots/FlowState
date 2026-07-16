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
  // ⌘⇧F opens the fuzzy file/issue search. (⌘F cycles views — see NextView below —
  // so search lives on the shifted chord rather than the bare ⌘F.)
  { command: ShortcutCommand.OpenFileFinder, keys: 'mod+shift+f' },
  // ⌘⇧P toggles a Markdown file tab between rendered preview and source.
  { command: ShortcutCommand.ToggleFilePreview, keys: 'mod+shift+p' },
  { command: ShortcutCommand.ShowShortcutsHelp, keys: 'mod+/' },
  { command: ShortcutCommand.OpenSettings, keys: 'mod+,' },
  { command: ShortcutCommand.ToggleSidebar, keys: 'mod+b' },
  { command: ShortcutCommand.NewTab, keys: 'mod+t' },
  { command: ShortcutCommand.CloseTab, keys: 'mod+w' },
  { command: ShortcutCommand.NextTab, keys: 'mod+shift+]' },
  { command: ShortcutCommand.PrevTab, keys: 'mod+shift+[' },
  // Top-level views (Workspace / Git / Terminals / …). ⌘D cycles back, ⌘F
  // forward — an adjacent, single-key pair for a heavily-used switch. Both are
  // free of native-menu accelerators (no Find/Save role). Numbers stay reserved
  // for the inner chat tabs above.
  { command: ShortcutCommand.NextView, keys: 'mod+f' },
  { command: ShortcutCommand.PrevView, keys: 'mod+d' },
  { command: ShortcutCommand.GoToTab1, keys: 'mod+1' },
  { command: ShortcutCommand.GoToTab2, keys: 'mod+2' },
  { command: ShortcutCommand.GoToTab3, keys: 'mod+3' },
  { command: ShortcutCommand.GoToTab4, keys: 'mod+4' },
  { command: ShortcutCommand.GoToTab5, keys: 'mod+5' },
  { command: ShortcutCommand.FocusInput, keys: 'mod+l' },
  { command: ShortcutCommand.InterruptSession, keys: 'mod+.' },
  // Shift+Tab toggles plan mode. The composer handles it inline while focused
  // (the engine's focus guard suppresses non-modifier chords while editing);
  // this binding gives the command palette / cheat-sheet a discoverable entry.
  { command: ShortcutCommand.TogglePlanMode, keys: 'shift+tab' },
  { command: ShortcutCommand.PickWorkingFolder, keys: 'mod+o' },
  // ⌘N opens the create-ticket modal, gated to the Linear view (see commands.ts).
  { command: ShortcutCommand.NewTicket, keys: 'mod+n' },
];
