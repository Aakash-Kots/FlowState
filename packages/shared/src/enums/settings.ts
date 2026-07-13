/**
 * Enumerations for user-facing app preferences persisted in the `settings`
 * key/value table. Values are stable wire strings: they are stored in SQLite and
 * travel over IPC (`settings.get` / `settings.setCodeTheme`), and the renderer
 * also uses them as the `data-code-theme` attribute that swaps the syntax-
 * highlighting palette in CSS — so they must not change once shipped.
 */

/**
 * A named syntax-highlighting palette for every code surface (git diffs, chat
 * code blocks). Each value maps to a `[data-code-theme='…']` block in the
 * renderer's `globals.css`.
 */
export enum CodeTheme {
  GithubDark = 'github-dark',
  OneDark = 'one-dark',
  Dracula = 'dracula',
  Nord = 'nord',
  Monokai = 'monokai',
  TokyoNight = 'tokyo-night',
  SolarizedDark = 'solarized-dark',
  GithubLight = 'github-light',
}
