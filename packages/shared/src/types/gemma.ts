/**
 * Types for the on-device generative assistant ("Ask Gemma"). The `gemma.ask`
 * subscription streams these events to the palette. Validation lives in
 * `../schemas/gemma`.
 */
import type { GemmaStreamKind } from '../enums/gemma';

/**
 * One chunk of a streamed reply. `Token` carries the next text fragment in
 * `text`; `Done` marks completion (`text` empty); `Error` carries the failure
 * message in `text`.
 */
export type GemmaStreamEvent = {
  kind: GemmaStreamKind;
  text: string;
};
