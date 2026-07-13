import { CodeTheme } from '@flowstate/shared';
import type { CodeThemeMeta } from '../types/settings';

///////////////
// Constants //
///////////////

/**
 * The selectable code themes, in the order they appear in Settings. Every
 * `CodeTheme` member must have an entry — the picker iterates this list. Colors
 * live in `globals.css` under the matching `[data-code-theme='…']` block.
 */
export const CODE_THEMES: CodeThemeMeta[] = [
  { id: CodeTheme.GithubDark, label: 'GitHub Dark', appearance: 'dark' },
  { id: CodeTheme.OneDark, label: 'One Dark', appearance: 'dark' },
  { id: CodeTheme.Dracula, label: 'Dracula', appearance: 'dark' },
  { id: CodeTheme.Nord, label: 'Nord', appearance: 'dark' },
  { id: CodeTheme.Monokai, label: 'Monokai', appearance: 'dark' },
  { id: CodeTheme.TokyoNight, label: 'Tokyo Night', appearance: 'dark' },
  { id: CodeTheme.SolarizedDark, label: 'Solarized Dark', appearance: 'dark' },
  { id: CodeTheme.GithubLight, label: 'GitHub Light', appearance: 'light' },
];

/** A short, multi-language snippet used to preview a theme in the picker cards. */
export const CODE_THEME_PREVIEW = `// fetch the active worktree
export async function load(id: string) {
  const res = await client.git.status.query({ id });
  return res.files.filter((f) => f.staged).length;
}`;
