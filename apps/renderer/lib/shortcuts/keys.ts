/**
 * Pure DOM chord utilities for the keymap engine — the renderer's half of the
 * chord contract defined in `@flowstate/shared` (`KeyChord`). Chords are matched
 * against a `KeyboardEvent`, captured from one (for rebinding), and formatted for
 * display in `Kbd`. Key tokens come from `event.code` (physical key) so a chord
 * like `mod+shift+]` matches regardless of the shifted character the layout
 * produces.
 */
import type { KeyChord } from '@flowstate/shared';

/////////////
// Helpers //
/////////////

/** True on macOS, where the primary modifier (`mod`) is ⌘ rather than Ctrl. */
function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

/** Physical-key → chord token map for keys whose `code` isn't self-evident. */
const CODE_TOKENS: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Slash: '/',
  Backslash: '\\',
  Period: '.',
  Comma: ',',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Space: 'space',
  Enter: 'enter',
  Escape: 'escape',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** The single non-modifier key token for an event, or '' for a bare modifier. */
function keyToken(e: KeyboardEvent): string {
  const { code } = e;
  if (code in CODE_TOKENS) return CODE_TOKENS[code]!;
  if (code.startsWith('Key')) return code.slice(3).toLowerCase(); // KeyA → 'a'
  if (code.startsWith('Digit')) return code.slice(5); // Digit1 → '1'
  if (code.startsWith('Numpad')) return code.slice(6).toLowerCase();
  // Bare modifier presses have no standalone token.
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return '';
  return e.key.toLowerCase();
}

///////////////////
// Chord parsing //
///////////////////

/** Whether an element is a text-editing surface (the focus guard). */
export function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Whether a chord carries an escaping modifier (so it's safe while typing). */
export function hasModifier(chord: KeyChord): boolean {
  const mods = chord.toLowerCase().split('+').slice(0, -1);
  return mods.some((m) => m === 'mod' || m === 'ctrl' || m === 'alt' || m === 'meta');
}

/** Does this keyboard event satisfy `chord` (e.g. `"mod+shift+]"`)? */
export function matchesChord(e: KeyboardEvent, chord: KeyChord): boolean {
  const parts = chord.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  if (keyToken(e) !== key) return false;

  const mac = isMac();
  const needMeta = mods.has('meta') || (mods.has('mod') && mac);
  const needCtrl = mods.has('ctrl') || (mods.has('mod') && !mac);
  return (
    e.metaKey === needMeta &&
    e.ctrlKey === needCtrl &&
    e.altKey === mods.has('alt') &&
    e.shiftKey === mods.has('shift')
  );
}

/**
 * The canonical chord for a keyboard event, or '' for a bare modifier press.
 * Used by the rebinding UI to capture what the user typed.
 */
export function eventToChord(e: KeyboardEvent): KeyChord {
  const key = keyToken(e);
  if (!key) return '';
  const mac = isMac();
  const parts: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) parts.push('mod');
  if (mac && e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  if (!mac && e.metaKey) parts.push('meta');
  parts.push(key);
  return parts.join('+');
}

////////////////////
// Chord display  //
////////////////////

const GLYPHS_MAC: Record<string, string> = { mod: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' };
const LABELS_OTHER: Record<string, string> = {
  mod: 'Ctrl',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Win',
};
const KEY_LABELS: Record<string, string> = {
  enter: '↵',
  escape: 'Esc',
  space: 'Space',
  tab: 'Tab',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  backspace: '⌫',
  delete: '⌦',
};

/** Human-facing tokens for a chord, one per key, for rendering in `Kbd`. */
export function formatChord(chord: KeyChord): string[] {
  const mac = isMac();
  const parts = chord.toLowerCase().split('+');
  const key = parts[parts.length - 1]!;
  const mods = parts.slice(0, -1);
  const modTokens = mods.map((m) => (mac ? (GLYPHS_MAC[m] ?? m) : (LABELS_OTHER[m] ?? m)));
  const keyToken = KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  return [...modTokens, keyToken];
}
