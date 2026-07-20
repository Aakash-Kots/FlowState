/**
 * Enumerations for the on-device generative assistant ("Ask Gemma"), shared
 * between the main process (which runs the model) and the renderer (which
 * streams the reply into the palette). Values are the wire strings.
 */

/** The kind of chunk pushed over the `gemma.ask` streaming subscription. */
export enum GemmaStreamKind {
  Token = 'token',
  Done = 'done',
  Error = 'error',
  /** The model wants to run a tool (awaits confirmation for side-effecting ones). */
  ToolCall = 'tool-call',
  /** A tool finished (or was denied) — carries the outcome. */
  ToolResult = 'tool-result',
}

/**
 * Which generative Gemma tier the palette runs. `Auto` lets the main process
 * pick the largest tier (and quant) that fits the machine's RAM; the `Force*`
 * values let a user override that from settings (e.g. run 12B on a machine the
 * auto-picker would keep at 4B, accepting the memory pressure). Resolved to a
 * concrete model + quant by `selectGenerativeSpec` in the main process.
 */
export enum GemmaTierPreference {
  Auto = 'auto',
  Force1b = 'force-1b',
  Force4b = 'force-4b',
  Force12b = 'force-12b',
}
