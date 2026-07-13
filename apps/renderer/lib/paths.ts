/** Presentational path helpers shared across the sidebar and project views. */

/** The folder's basename — used as a project's display name. */
export function projectName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

/** Collapse a home-directory prefix to `~` for compact display. */
export function shortenPath(path: string): string {
  const home = path.match(/^\/(?:Users|home)\/[^/]+/);
  return home ? path.replace(home[0], '~') : path;
}
