/**
 * Enumerations for the hosted generative assistant ("Ask Gemini"), shared
 * between the main process (which calls the Gemini API) and the renderer (which
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
