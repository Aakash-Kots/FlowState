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
}
