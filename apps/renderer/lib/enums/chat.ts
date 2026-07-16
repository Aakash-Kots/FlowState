/**
 * Renderer-only chat enums (not part of the cross-process protocol).
 */

/** What the agent is doing between text, for the activity indicator. */
export enum ActivityIndicator {
  Thinking = 'thinking',
  Tool = 'tool',
}

/** Kind of a flattened transcript render item (see `groupChatItems`). */
export enum ChatItemKind {
  /** A whole-message bubble — a user prompt or the end-of-turn result footer. */
  Message = 'message',
  /** A standalone assistant block: text, thinking, or an orphan tool result. */
  Block = 'block',
  /** A single tool call, rendered flat inline in the transcript. */
  Tool = 'tool',
  /** A proposed plan (`ExitPlanMode`), rendered inline as a markdown message. */
  Plan = 'plan',
  /** Assistant prose emitted alongside an `ExitPlanMode` plan — the pre-plan
   *  "report", rendered behind an always-collapsed disclosure. */
  PlanReport = 'plan-report',
}
