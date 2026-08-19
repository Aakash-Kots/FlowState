/**
 * Renderer-only terminal shapes. These never cross the IPC boundary (the wire
 * types live in `@flowstate/shared`), so they need no matching zod schema.
 */

/** A tracked script's latest completion. `seq` bumps on each (re-)run so re-runs are observable. */
export type ScriptCompletion = { exitCode: number; seq: number };
