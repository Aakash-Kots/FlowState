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

/**
 * The base UI text size. Drives the renderer's root `html` font size, which the
 * rem-based Tailwind scale multiplies from — so the whole interface scales with
 * it. Values are stable wire strings persisted in SQLite and sent over IPC.
 */
export enum FontSize {
  Small = 'small',
  Default = 'default',
  Large = 'large',
  ExtraLarge = 'extra-large',
}
