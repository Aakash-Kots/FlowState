/**
 * ShortcutsService — the main-process half of the keyboard-shortcut system.
 *
 * It owns two things: the persisted user keymap (overrides layered over the
 * shared defaults, stored in the `settings` KV) and an event bus. Application
 * menu items push their command over the bus (`trigger`), which the renderer
 * receives via the `shortcuts.onCommand` tRPC subscription — this is how a
 * shortcut fires even when a native surface (e.g. a focused terminal) would
 * swallow the web keydown. `setKeymap` also announces a change so the menu can
 * rebuild its accelerators to match the new bindings.
 */
import { EventEmitter } from 'node:events';
import {
  KEYBINDINGS_SETTING_KEY,
  keymapOverridesSchema,
  type KeymapOverrides,
} from '@flowstate/shared';
import type { ShortcutCommand } from '@flowstate/shared';
import { getSetting, setSetting } from '../store';

///////////////
// Constants //
///////////////

const COMMAND_EVENT = 'command';
const KEYMAP_CHANGE_EVENT = 'keymap-change';

export class ShortcutsService {
  // 'command' → (command: ShortcutCommand), 'keymap-change' → ()
  private readonly events = new EventEmitter();

  /** The user's persisted keymap overrides (validated; `{}` if none set yet). */
  getKeymap(): KeymapOverrides {
    return keymapOverridesSchema.parse(getSetting<KeymapOverrides>(KEYBINDINGS_SETTING_KEY) ?? {});
  }

  /** Persist new overrides and notify the menu to rebuild its accelerators. */
  setKeymap(overrides: KeymapOverrides): KeymapOverrides {
    const parsed = keymapOverridesSchema.parse(overrides);
    setSetting(KEYBINDINGS_SETTING_KEY, parsed);
    this.events.emit(KEYMAP_CHANGE_EVENT);
    return parsed;
  }

  /** Fire a command (from a menu click) toward any subscribed renderer. */
  trigger(command: ShortcutCommand): void {
    this.events.emit(COMMAND_EVENT, command);
  }

  /** Subscribe to commands triggered from the native menu. Returns an unsubscribe. */
  onCommand(listener: (command: ShortcutCommand) => void): () => void {
    this.events.on(COMMAND_EVENT, listener);
    return () => this.events.off(COMMAND_EVENT, listener);
  }

  /** Subscribe to keymap changes (so the menu rebuilds). Returns an unsubscribe. */
  onKeymapChange(listener: () => void): () => void {
    this.events.on(KEYMAP_CHANGE_EVENT, listener);
    return () => this.events.off(KEYMAP_CHANGE_EVENT, listener);
  }
}

/** App-wide singleton. */
export const shortcutsService = new ShortcutsService();
