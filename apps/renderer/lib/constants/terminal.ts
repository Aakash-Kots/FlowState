/**
 * Terminal presentation constants (renderer). The xterm theme is tuned to the
 * app's dark gray-accent tokens (tailwind.config.ts) and shared by every xterm
 * surface (onboarding + workspace terminals).
 */

/** xterm color theme matching the app's base/foreground/accent tokens. */
export const XTERM_THEME = {
  background: '#0d0d0e', // base — matches the chat/code window
  foreground: '#e5e7eb',
  cursor: '#d6d7d9', // accent
  cursorAccent: '#0d0d0e',
  selectionBackground: '#2b2c2f',
  black: '#0d0d0e',
  brightBlack: '#8f9194',
  white: '#d6d7d9',
  brightWhite: '#ffffff',
  green: '#4ade80',
  brightGreen: '#4ade80',
  yellow: '#fbbf24',
  brightYellow: '#fbbf24',
  red: '#f87171',
  brightRed: '#f87171',
  blue: '#7aa2f7',
  cyan: '#67e8f9',
  magenta: '#c4b5fd',
};
