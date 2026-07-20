/**
 * Types for the on-device generative assistant ("Ask Gemma"). The `gemma.ask`
 * subscription streams `GemmaStreamEvent`s to the palette; when the model wants
 * to run a side-effecting tool it emits a `ToolCall` and waits for the renderer
 * to answer via `gemma.respondTool`. Validation lives in `../schemas/gemma`.
 */
import type { GemmaStreamKind, GemmaTierPreference } from '../enums/gemma';

/** What the palette knows about the user's current focus, passed into `ask` so
 * tools can default their target (e.g. create a worktree in the active project)
 * instead of forcing the model to resolve an id from scratch. */
export type GemmaAskContext = {
  activeProjectId?: string | null;
  activeWorkspaceId?: string | null;
};

/** Input to `gemma.ask`: the prompt plus optional current-focus context. */
export type GemmaAskInput = {
  prompt: string;
  context?: GemmaAskContext | null;
};

/** A tool the model wants to run, surfaced to the renderer. `id` correlates the
 * call with its `ToolResult` and with a `respondTool` answer; `title` is a
 * human-readable summary for the confirmation card; `needsConfirmation` is false
 * for read-only tools (they run immediately). */
export type GemmaToolCall = {
  id: string;
  name: string;
  title: string;
  args: Record<string, unknown>;
  needsConfirmation: boolean;
};

/** The outcome of a tool call, streamed after it runs (or is denied). */
export type GemmaToolResult = {
  id: string;
  name: string;
  ok: boolean;
  summary: string;
};

/**
 * One chunk of a streamed reply. `Token` carries the next text fragment;
 * `Done` marks completion (empty text); `Error` carries a failure message;
 * `ToolCall`/`ToolResult` carry the tool round-trip.
 */
export type GemmaStreamEvent =
  | { kind: GemmaStreamKind.Token; text: string }
  | { kind: GemmaStreamKind.Done; text: string }
  | { kind: GemmaStreamKind.Error; text: string }
  | { kind: GemmaStreamKind.ToolCall; toolCall: GemmaToolCall }
  | { kind: GemmaStreamKind.ToolResult; toolResult: GemmaToolResult };

/** The renderer's answer to a pending tool call. When `approved`, `editedArgs`
 * (if present) replaces the model-proposed args before the tool runs. */
export type RespondGemmaToolInput = {
  id: string;
  approved: boolean;
  editedArgs?: Record<string, unknown> | null;
};

/** User preferences for the Ask palette (surfaced in settings). */
export type GemmaPrefs = {
  tierPreference: GemmaTierPreference;
};

/** Input to `gemma.setTierPreference`. */
export type SetGemmaTierInput = {
  preference: GemmaTierPreference;
};
