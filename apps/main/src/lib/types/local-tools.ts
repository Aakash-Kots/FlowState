/**
 * Types for the Gemini tool-calling loop (main process). A `LocalTool` binds a
 * JSON-Schema parameter shape (`params`, handed to Gemini as
 * `functionDeclarations[].parametersJsonSchema`) to a zod validator (`parse`,
 * the execution boundary) and an effect (`execute`). These never cross IPC —
 * the renderer only sees the `GemmaToolCall`/`Result` wire shapes in
 * `@flowstate/shared` — so no zod schema lives here.
 */
import type { LocalToolName } from '../enums/local-tools';

/** A refined Linear ticket: a polished imperative title + markdown body. */
export type RefinedTicket = {
  title: string;
  description: string;
};

/** What the palette knows about the user's current focus when a tool runs, so
 * tools can default their target (e.g. create a worktree in the active project),
 * plus a `refineTicket` hook the ticket-creating tools use to reword the model's
 * raw title/description into a professional ticket before it hits Linear. */
export type ToolContext = {
  activeProjectId?: string | null;
  activeWorkspaceId?: string | null;
  /** Reword a raw title/description into a polished ticket. Falls back to the
   * raw text on failure (never rejects), so ticket creation can't break on it. */
  refineTicket?: (input: { title: string; description?: string }) => Promise<RefinedTicket>;
};

/**
 * A tool the model can call. `params` is a JSON Schema for the tool's arguments
 * (Gemini decodes against it); `parse` re-validates the raw args at the boundary
 * and returns the typed args; `execute` performs the effect and returns a short
 * human-readable summary for the model and the result card. `sideEffecting`
 * tools await user confirmation first.
 */
export type LocalTool = {
  name: LocalToolName;
  description: string;
  params: Record<string, unknown>;
  sideEffecting: boolean;
  /** Validate raw model args; throws on invalid input (the loop reports it back). */
  parse: (raw: unknown) => unknown;
  /** One-line summary of a call for the confirmation/result card. */
  summarize: (args: unknown) => string;
  /** Run the effect; the returned string is fed back to the model and shown. */
  execute: (args: unknown, ctx: ToolContext) => Promise<string>;
};
