/**
 * Renderer-only chat enums (not part of the cross-process protocol).
 */

/** What the agent is doing between text, for the activity indicator. */
export enum ActivityIndicator {
  Thinking = 'thinking',
  Tool = 'tool',
}
