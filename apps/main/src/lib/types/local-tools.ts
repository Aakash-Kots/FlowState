/**
 * Types for the on-device tool-calling loop (main process). A `LocalTool` binds
 * a node-llama-cpp function schema (`params`, which constrains decoding) to a
 * zod validator (`parse`, the execution boundary) and an effect (`execute`).
 * These never cross IPC — the renderer only sees the `GemmaToolCall`/`Result`
 * wire shapes in `@flowstate/shared` — so no zod schema lives here.
 */
import type { GbnfJsonSchema } from 'node-llama-cpp';
import type { LocalToolName } from '../enums/local-tools';

/** What the palette knows about the user's current focus when a tool runs, so
 * tools can default their target (e.g. create a worktree in the active project). */
export type ToolContext = {
  activeProjectId?: string | null;
  activeWorkspaceId?: string | null;
};

/**
 * A tool the model can call. `params` is node-llama-cpp's GBNF-JSON schema (all
 * listed properties are required — model optionals are nullable unions); `parse`
 * re-validates the raw args at the boundary and returns the typed args; `execute`
 * performs the effect and returns a short human-readable summary for the model
 * and the result card. `sideEffecting` tools await user confirmation first.
 */
export type LocalTool = {
  name: LocalToolName;
  description: string;
  params: GbnfJsonSchema;
  sideEffecting: boolean;
  /** Validate raw model args; throws on invalid input (the loop reports it back). */
  parse: (raw: unknown) => unknown;
  /** One-line summary of a call for the confirmation/result card. */
  summarize: (args: unknown) => string;
  /** Run the effect; the returned string is fed back to the model and shown. */
  execute: (args: unknown, ctx: ToolContext) => Promise<string>;
};
