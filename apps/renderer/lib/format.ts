/**
 * Small presentational formatters shared across the renderer.
 */

/////////////
// Helpers //
/////////////

/**
 * A compact, human elapsed-time label: `"820ms"`, `"49s"`, `"6m 49s"`,
 * `"1h 2m"`. Used by the live working timer and the end-of-turn summary. Rounds
 * to whole seconds above a second; drops the finer unit once hours are involved.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
