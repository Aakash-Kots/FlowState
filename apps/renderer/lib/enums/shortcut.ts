/**
 * Renderer-side shortcut enums. The shared, cross-app `ShortcutCommand` /
 * `ShortcutScope` live in `@flowstate/shared`; this file holds enums that only
 * the renderer's dispatch layer needs.
 */

/**
 * Where a dispatched command came from. A single keystroke is delivered by both
 * the web keydown listener and the native menu channel, so `dispatch` dedupes a
 * cross-source echo while still honouring genuine repeats from the same source.
 */
export enum DispatchSource {
  Keydown = 'keydown',
  Menu = 'menu',
}
