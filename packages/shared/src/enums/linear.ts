/**
 * Enumerations for the Linear domain, shared between the main process and the
 * renderer. Values are the wire strings, so they serialize over IPC unchanged.
 */

/**
 * Linear's fixed workflow-state *category* — the `type` discriminant every
 * team-defined state carries. Individual states (their names, colours) are
 * team-configurable and so are never enumerated here; only this category is a
 * fixed Linear set, re-declared as a mirror enum (values byte-identical to
 * Linear's) so we can group/colour states without branching on raw strings.
 */
export enum LinearStateType {
  Triage = 'triage',
  Backlog = 'backlog',
  Unstarted = 'unstarted',
  Started = 'started',
  Completed = 'completed',
  Canceled = 'canceled',
}
