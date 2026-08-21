/**
 * Enumerations for the semantic-search domain, shared between the main process
 * (which runs the local embedding model) and the renderer (which shows the
 * model's readiness/download state in the Linear search UI). Values are the wire
 * strings, so they serialize over IPC unchanged.
 */

/**
 * Lifecycle of the on-device embedding model as the renderer sees it. Drives the
 * search box's "preparing smart search…" affordance: the weights download once
 * (`Downloading`), load into memory (`Loading`), then serve queries (`Ready`).
 * `Absent` is the pre-download resting state; `Error` degrades search back to
 * the existing literal fuzzy + server-substring path.
 */
export enum LocalModelState {
  Absent = 'absent',
  Downloading = 'downloading',
  Loading = 'loading',
  Ready = 'ready',
  Error = 'error',
}
