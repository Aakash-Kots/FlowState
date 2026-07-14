/**
 * Enumerations for the keyboard-shortcut system shared between the main process
 * (Electron menu accelerators) and the renderer (the keymap engine). Command
 * values are stable wire strings: they key the persisted user keymap in SQLite
 * and travel over IPC on the `shortcuts.onCommand` channel, so they must not
 * change once shipped. Chord strings and command handlers live outside shared —
 * only the identifiers and grouping metadata are cross-app.
 */

/**
 * A stable identifier for a bindable command. Handlers are defined renderer-side
 * (they call renderer store actions); these ids are the contract that the keymap,
 * the settings store, and the Electron menu all agree on.
 */
export enum ShortcutCommand {
  OpenCommandPalette = 'open-command-palette',
  OpenFileFinder = 'open-file-finder',
  ShowShortcutsHelp = 'show-shortcuts-help',
  OpenSettings = 'open-settings',
  ToggleSidebar = 'toggle-sidebar',
  NewTab = 'new-tab',
  CloseTab = 'close-tab',
  NextTab = 'next-tab',
  PrevTab = 'prev-tab',
  NextView = 'next-view',
  PrevView = 'prev-view',
  GoToTab1 = 'go-to-tab-1',
  GoToTab2 = 'go-to-tab-2',
  GoToTab3 = 'go-to-tab-3',
  GoToTab4 = 'go-to-tab-4',
  GoToTab5 = 'go-to-tab-5',
  FocusInput = 'focus-input',
  InterruptSession = 'interrupt-session',
  TogglePlanMode = 'toggle-plan-mode',
  PickWorkingFolder = 'pick-working-folder',
}

/**
 * Where a command is allowed to fire. `Global` chords carry a modifier and fire
 * even while a text field is focused; `Editor` chords are suppressed when an
 * editable element holds focus so they don't steal keystrokes from typing.
 */
export enum ShortcutScope {
  Global = 'global',
  Editor = 'editor',
}

/** Grouping for the shortcuts cheat-sheet / command palette. */
export enum ShortcutCategory {
  Tabs = 'tabs',
  Navigation = 'navigation',
  Session = 'session',
  App = 'app',
}
