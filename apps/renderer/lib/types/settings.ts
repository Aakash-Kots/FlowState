import type { CodeTheme } from '@flowstate/shared';

/**
 * Presentation metadata for a selectable code-highlighting palette. The colors
 * themselves live in CSS (`globals.css`, keyed by `data-code-theme`); this only
 * carries what the settings picker needs to label and group the choices.
 */
export type CodeThemeMeta = {
  id: CodeTheme;
  label: string;
  /** Whether the palette reads as a dark or light editor — groups the picker. */
  appearance: 'dark' | 'light';
};
