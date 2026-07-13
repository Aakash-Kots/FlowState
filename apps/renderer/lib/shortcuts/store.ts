'use client';

import { create } from 'zustand';
import {
  DEFAULT_KEYBINDINGS,
  type Keybinding,
  type KeymapOverrides,
  type KeyChord,
  type ShortcutCommand,
} from '@flowstate/shared';
import { trpc } from '../trpc';

///////////
// Types //
///////////

type ShortcutsState = {
  /** True once the persisted overrides have loaded from the main process. */
  hydrated: boolean;
  /** User rebindings layered over the defaults. */
  overrides: KeymapOverrides;
  /** Resolved bindings = defaults with overrides applied. */
  bindings: Keybinding[];
  paletteOpen: boolean;
  helpOpen: boolean;
  /**
   * The sidebar's toggle, bridged in by `ShortcutProvider` (which lives inside
   * `SidebarProvider` and can call `useSidebar`). Null until mounted.
   */
  sidebarToggle: (() => void) | null;
};

/////////////
// Helpers //
/////////////

/** Apply overrides over the default keymap to get the effective bindings. */
function resolve(overrides: KeymapOverrides): Keybinding[] {
  return DEFAULT_KEYBINDINGS.map((b) => ({
    command: b.command,
    keys: overrides[b.command] ?? b.keys,
  }));
}

export const useShortcuts = create<ShortcutsState>(() => ({
  hydrated: false,
  overrides: {},
  bindings: resolve({}),
  paletteOpen: false,
  helpOpen: false,
  sidebarToggle: null,
}));

/////////////
// Actions //
/////////////

let hydrated = false;

/** Load persisted overrides once for the app's lifetime. */
export function hydrateShortcuts(): void {
  if (hydrated) return;
  hydrated = true;
  void trpc()
    .shortcuts.getKeymap.query()
    .then((overrides) =>
      useShortcuts.setState({ hydrated: true, overrides, bindings: resolve(overrides) }),
    )
    .catch(() => useShortcuts.setState({ hydrated: true }));
}

/** Persist the current overrides to the main process (which rebuilds the menu). */
function persist(overrides: KeymapOverrides): void {
  void trpc().shortcuts.setKeymap.mutate(overrides);
}

/** Rebind a command to a new chord. */
export function setBinding(command: ShortcutCommand, keys: KeyChord): void {
  const overrides = { ...useShortcuts.getState().overrides, [command]: keys };
  useShortcuts.setState({ overrides, bindings: resolve(overrides) });
  persist(overrides);
}

/** Drop a command's override, restoring its default chord. */
export function resetBinding(command: ShortcutCommand): void {
  const overrides = { ...useShortcuts.getState().overrides };
  delete overrides[command];
  useShortcuts.setState({ overrides, bindings: resolve(overrides) });
  persist(overrides);
}

export function setPaletteOpen(open: boolean): void {
  useShortcuts.setState({ paletteOpen: open });
}

export function setHelpOpen(open: boolean): void {
  useShortcuts.setState({ helpOpen: open });
}

/** Register the sidebar toggle so the `ToggleSidebar` command can call it. */
export function setSidebarToggle(toggle: (() => void) | null): void {
  useShortcuts.setState({ sidebarToggle: toggle });
}
