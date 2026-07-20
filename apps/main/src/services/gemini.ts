/**
 * GeminiService — the hosted generative assistant, powering the "Ask Gemini"
 * palette (double-tap Space), Linear-ticket wording refinement, and mic
 * speech-to-text. It calls Google's Gemini API with the user's own API key
 * (stored via safeStorage), replacing the former on-device Gemma model.
 *
 * `generate` streams a reply token-by-token and drives a manual function-calling
 * loop: the model may request one of the tools in `geminiTools.ts`, which we
 * gate (auto-approving read-only tools, parking side-effecting ones for the
 * renderer to approve), execute, and feed back — repeating until the model
 * answers with no further tool calls.
 *
 * The SDK (`@google/genai`) is loaded via a real dynamic `import()` (like the
 * Claude SDK in `claude.ts`) and the client is cached per API key.
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Content, FunctionCall, GoogleGenAI, Part } from '@google/genai';
import {
  LocalModelState,
  type GemmaToolCall,
  type GemmaToolResult,
  type ModelStatus,
  type RespondGemmaToolInput,
} from '@flowstate/shared';
import { SecretName } from '../lib/enums/secret';
import type { RefinedTicket, ToolContext } from '../lib/types/local-tools';
import { getSecret, hasSecret } from '../store/secrets';
import { buildDispatch, TOOL_DECLARATIONS, type ToolDecision } from './geminiTools';

///////////
// Types //
///////////

type Lib = typeof import('@google/genai');

/** Callbacks the router passes into `generate` to stream a reply plus its tool
 * round-trips back to the palette. */
type GenerateHandlers = {
  onToken: (text: string) => void;
  onToolCall: (call: GemmaToolCall) => void;
  onToolResult: (result: GemmaToolResult) => void;
};

/** A gated tool call awaiting the renderer's approve/deny answer. */
type PendingTool = {
  resolve: (decision: ToolDecision) => void;
};

///////////////
// Constants //
///////////////

const STATUS_EVENT = 'status';

/** The chat/tool model — fast, cheap, and function-calling capable. */
const GEMINI_CHAT_MODEL = 'gemini-3.1-flash-lite';
/** One-shot ticket wording refinement runs on the same fast model. */
const GEMINI_REFINE_MODEL = 'gemini-3.1-flash-lite';
/** Speech-to-text transcription reuses the same multimodal model + API key. */
const GEMINI_TRANSCRIBE_MODEL = 'gemini-3.1-flash-lite';

/** Cap generated length so a runaway answer can't stall the palette. */
const MAX_OUTPUT_TOKENS = 1500;

/** Hard cap on model→tool→model round-trips per ask, a runaway-loop backstop. */
const MAX_TURNS = 6;

/** Steers the model toward short, direct answers in the inline palette. */
const SYSTEM_PROMPT_BASE =
  'You are Gemini, a concise, helpful assistant embedded in a developer tool (FlowState). ' +
  'Answer directly and briefly in Markdown. Prefer short paragraphs and code blocks where useful.';

/** How the model should use the action tools (see `geminiTools.ts`). */
const TOOL_GUIDANCE = [
  'You can take actions with tools: search or list Linear issues, list Linear teams and workflow states,',
  'create a Linear ticket, create a git worktree/workspace, or create a ticket and a linked worktree together.',
  'Resolve ids before acting — call list_linear_teams to get a teamId before creating a ticket; never invent ids.',
  'Creating tickets or worktrees asks the user for confirmation (the app handles that) — just call the tool with',
  'your best arguments. If a call is denied, do not retry it. For plain questions, answer directly without tools.',
].join(' ');

/** System prompt for the one-shot ticket-wording rewrite. */
const REFINE_SYSTEM =
  'You rewrite rough notes into a clear, well-structured, professional Linear ticket. ' +
  'Produce a concise imperative title and a descriptive markdown body (context, and acceptance criteria when implied). ' +
  'Preserve the original intent; do not invent facts, scope, or requirements that were not stated. ' +
  'Respond with JSON: {"title": string, "description": string}.';

/** JSON Schema forcing the refine model to return a title + description. */
const REFINE_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' }, description: { type: 'string' } },
  required: ['title', 'description'],
} as const;

/** Prompt for verbatim audio transcription. */
const TRANSCRIBE_PROMPT =
  'Transcribe this audio to text verbatim. Return only the transcript, with no preamble, quotes, or commentary.';

/** Compose the system prompt for a turn, injecting the user's current focus so
 * tools can default their target. */
function buildSystemPrompt(ctx: ToolContext): string {
  const lines = [SYSTEM_PROMPT_BASE, TOOL_GUIDANCE];
  if (ctx.activeProjectId) {
    lines.push(`The active project id is ${ctx.activeProjectId} — use it as the default for new worktrees.`);
  }
  return lines.join('\n\n');
}

/////////////
// Helpers //
/////////////

let lib: Promise<Lib> | null = null;
function loadLib(): Promise<Lib> {
  lib ??= import('@google/genai');
  return lib;
}

///////////////////
// GeminiService //
///////////////////

export class GeminiService extends EventEmitter {
  /** The genai client, cached per API key (rebuilt when the key changes). */
  private client: { key: string; ai: GoogleGenAI } | null = null;
  /** Side-effecting tool calls parked awaiting the renderer's approve/deny,
   * keyed by call id (mirrors the permission-parking in `claude.ts`). */
  private pendingTools = new Map<string, PendingTool>();

  getStatus(): ModelStatus {
    const ready = hasSecret(SecretName.GeminiApiKey);
    return {
      state: ready ? LocalModelState.Ready : LocalModelState.Absent,
      downloadProgress: null,
      modelId: GEMINI_CHAT_MODEL,
      error: ready ? null : 'Add a Gemini API key in Settings to use Ask Gemini.',
    };
  }

  isReady(): boolean {
    return hasSecret(SecretName.GeminiApiKey);
  }

  onStatus(listener: (status: ModelStatus) => void): () => void {
    this.on(STATUS_EVENT, listener);
    return () => this.off(STATUS_EVENT, listener);
  }

  /** Re-emit the current status — called by the settings router after the API
   * key is saved or cleared so the palette flips ready/not-ready live. */
  notifyKeyChanged(): void {
    this.emit(STATUS_EVENT, this.getStatus());
  }

  /** The genai client for the current key, rebuilt when the key changes. Throws
   * a friendly error when no key is set. */
  private async getClient(): Promise<GoogleGenAI> {
    const key = getSecret(SecretName.GeminiApiKey);
    if (!key) throw new Error('No Gemini API key set. Add one in Settings to use Ask Gemini.');
    if (this.client?.key === key) return this.client.ai;
    const { GoogleGenAI: Ctor } = await loadLib();
    const ai = new Ctor({ apiKey: key });
    this.client = { key, ai };
    return ai;
  }

  /**
   * Generate a response to `prompt`, streaming tokens and tool round-trips
   * through `handlers`. Drives the model→tool→model loop until the model replies
   * with no further tool calls (or `MAX_TURNS` is hit). `ctx` is the user's
   * current focus, used to default tool targets; `signal` cancels the turn.
   */
  async generate(
    prompt: string,
    ctx: ToolContext,
    handlers: GenerateHandlers,
    signal?: AbortSignal,
  ): Promise<string> {
    const ai = await this.getClient();
    const toolCtx: ToolContext = { ...ctx, refineTicket: (input) => this.refineTicket(input) };
    const dispatch = buildDispatch(toolCtx, {
      nextId: () => randomUUID(),
      gate: (call) => this.gateToolCall(call, handlers.onToolCall, signal),
      onResult: (result) => handlers.onToolResult(result),
    });

    const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
    const config = {
      systemInstruction: buildSystemPrompt(ctx),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      abortSignal: signal,
    };

    let finalText = '';
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = await ai.models.generateContentStream({ model: GEMINI_CHAT_MODEL, contents, config });

      // Accumulate the model turn's raw parts verbatim — they carry the
      // `thoughtSignature` Gemini 3.x requires echoed back on the next request.
      // Deriving calls from `chunk.functionCalls` instead would strip it.
      let text = '';
      const modelParts: Part[] = [];
      for await (const chunk of stream) {
        if (signal?.aborted) return finalText;
        const piece = chunk.text;
        if (piece) {
          text += piece;
          handlers.onToken(piece);
        }
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (parts?.length) modelParts.push(...parts);
      }
      finalText = text;

      // Record the model's turn (signed parts intact) so the follow-up request
      // carries the full conversation.
      if (modelParts.length) contents.push({ role: 'model', parts: modelParts });
      const calls: FunctionCall[] = modelParts.flatMap((p) => (p.functionCall ? [p.functionCall] : []));

      if (calls.length === 0) return finalText;

      // Run each requested tool and feed the results back for the next turn.
      const responseParts: Part[] = [];
      for (const call of calls) {
        const name = call.name ?? '';
        const summary = await dispatch(name, call.args ?? {});
        responseParts.push({ functionResponse: { name, response: { output: summary } } });
      }
      contents.push({ role: 'user', parts: responseParts });
    }
    return finalText;
  }

  /**
   * Rewrite a rough title/description into a polished ticket via a one-shot,
   * tool-free Gemini call. Never rejects — on any failure it returns the raw
   * text so ticket creation can't break on the rewrite.
   */
  async refineTicket(input: { title: string; description?: string }): Promise<RefinedTicket> {
    const fallback: RefinedTicket = { title: input.title, description: input.description ?? '' };
    try {
      const ai = await this.getClient();
      const source = `Title: ${input.title}\n\nDetails: ${input.description?.trim() || '(none provided)'}`;
      const res = await ai.models.generateContent({
        model: GEMINI_REFINE_MODEL,
        contents: [{ role: 'user', parts: [{ text: source }] }],
        config: {
          systemInstruction: REFINE_SYSTEM,
          responseMimeType: 'application/json',
          responseJsonSchema: REFINE_SCHEMA,
          temperature: 0.3,
        },
      });
      const parsed = JSON.parse(res.text ?? '') as { title?: unknown; description?: unknown };
      const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
      const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
      return { title: title || input.title, description };
    } catch {
      return fallback;
    }
  }

  /** Transcribe a base64-encoded audio clip to text via the Gemini API. */
  async transcribe(audioBase64: string, mimeType: string): Promise<string> {
    const ai = await this.getClient();
    const res = await ai.models.generateContent({
      model: GEMINI_TRANSCRIBE_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType, data: audioBase64 } }, { text: TRANSCRIBE_PROMPT }],
        },
      ],
      config: { temperature: 0 },
    });
    return (res.text ?? '').trim();
  }

  /**
   * Gate a tool call: always surface it to the renderer; auto-approve read-only
   * tools, but park side-effecting ones until the renderer answers via
   * `respondTool` (a denial — or the turn being aborted — resolves to not
   * approved so the loop unwinds cleanly).
   */
  private gateToolCall(
    call: GemmaToolCall,
    emit: (call: GemmaToolCall) => void,
    signal?: AbortSignal,
  ): Promise<ToolDecision> {
    emit(call);
    if (!call.needsConfirmation) return Promise.resolve({ approved: true });
    if (signal?.aborted) return Promise.resolve({ approved: false });

    return new Promise<ToolDecision>((resolve) => {
      const settle = (decision: ToolDecision): void => {
        if (!this.pendingTools.delete(call.id)) return;
        signal?.removeEventListener('abort', onAbort);
        resolve(decision);
      };
      const onAbort = (): void => settle({ approved: false });
      this.pendingTools.set(call.id, { resolve: settle });
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** Resolve a parked tool call with the renderer's approve/deny answer. */
  respondTool(input: RespondGemmaToolInput): void {
    const pending = this.pendingTools.get(input.id);
    if (!pending) return;
    pending.resolve({ approved: input.approved, args: input.editedArgs ?? undefined });
  }

  /** Release any parked confirmations so their generate() calls unwind (on quit). */
  dispose(): void {
    for (const [, pending] of this.pendingTools) pending.resolve({ approved: false });
    this.pendingTools.clear();
  }
}

/** Process-wide singleton. */
export const geminiService = new GeminiService();
