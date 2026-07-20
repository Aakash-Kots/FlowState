'use client';

import { create } from 'zustand';
import {
  GemmaStreamKind,
  type GemmaToolCall,
  type ModelStatus,
} from '@flowstate/shared';
import { trpc } from './trpc';
import { useWorkspace } from './workspace';

///////////
// Types //
///////////

type Unsub = { unsubscribe: () => void };

/** UI status of a tool the model called, tracked from the streamed events. */
type ToolCardStatus = 'pending' | 'running' | 'done' | 'error' | 'denied';

/** A tool call surfaced in the palette — a confirmation card while `pending`,
 * then a result line once it runs (or is denied). */
type ToolCard = {
  id: string;
  name: string;
  title: string;
  args: Record<string, unknown>;
  needsConfirmation: boolean;
  status: ToolCardStatus;
  result: string | null;
};

type GemmaState = {
  /** Whether the Ask-Gemma palette is open. */
  open: boolean;
  /** The prompt currently being answered (shown above the reply). */
  prompt: string;
  /** The streamed reply so far. */
  response: string;
  /** True while tokens/tool calls are still arriving. */
  streaming: boolean;
  error: string | null;
  /** Tool calls from the current turn, in arrival order. */
  tools: ToolCard[];
  /** Whether an API key is set (Ready) or not (Absent) — drives the needs-key hint. */
  modelStatus: ModelStatus | null;
};

///////////////
// Constants //
///////////////

const INITIAL: GemmaState = {
  open: false,
  prompt: '',
  response: '',
  streaming: false,
  error: null,
  tools: [],
  modelStatus: null,
};

/////////////
// Helpers //
/////////////

export const useGemma = create<GemmaState>(() => INITIAL);

/** The active `gemma.ask` stream, so a new prompt / close cancels the old one. */
let sub: Unsub | null = null;
/** Guard so the model-status subscription is opened at most once. */
let statusStarted = false;

function ensureStatusSub(): void {
  if (statusStarted) return;
  statusStarted = true;
  trpc()
    .gemma.modelStatus.query()
    .then((modelStatus) => useGemma.setState({ modelStatus }))
    .catch(() => {});
  trpc().gemma.onModelProgress.subscribe(undefined, {
    onData: (modelStatus) => useGemma.setState({ modelStatus }),
    onError: () => {},
  });
}

/** Append a fresh card for a tool the model just called. */
function addToolCard(call: GemmaToolCall): void {
  const card: ToolCard = {
    id: call.id,
    name: call.name,
    title: call.title,
    args: call.args,
    needsConfirmation: call.needsConfirmation,
    status: call.needsConfirmation ? 'pending' : 'running',
    result: null,
  };
  useGemma.setState((s) => ({ tools: [...s.tools, card] }));
}

/** Patch an existing tool card by id (no-op if it's gone). */
function patchToolCard(id: string, patch: Partial<ToolCard>): void {
  useGemma.setState((s) => ({
    tools: s.tools.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  }));
}

/////////////
// Actions //
/////////////

/** Open the palette (fresh), and start watching the API-key/ready status. */
export function openAskGemma(): void {
  sub?.unsubscribe();
  sub = null;
  useGemma.setState({ open: true, prompt: '', response: '', error: null, streaming: false, tools: [] });
  ensureStatusSub();
}

/** Close the palette and cancel any in-flight generation. */
export function closeAskGemma(): void {
  sub?.unsubscribe();
  sub = null;
  useGemma.setState({ open: false, streaming: false });
}

/** Clear the current answer to ask something new (keeps the palette open). */
export function resetAsk(): void {
  sub?.unsubscribe();
  sub = null;
  useGemma.setState({ prompt: '', response: '', error: null, streaming: false, tools: [] });
}

/**
 * Ask Gemini `prompt` and stream the reply (and any tool calls) into the store.
 * Cancels any previous generation first, and passes the active workspace so
 * tools can default their target. Requires a Gemini API key (set in Settings).
 */
export function askGemma(prompt: string): void {
  const q = prompt.trim();
  if (!q) return;
  sub?.unsubscribe();
  useGemma.setState({ prompt: q, response: '', error: null, streaming: true, tools: [] });
  const activeWorkspaceId = useWorkspace.getState().workspaceId;
  sub = trpc().gemma.ask.subscribe(
    { prompt: q, context: { activeWorkspaceId } },
    {
      onData: (evt) => {
        if (evt.kind === GemmaStreamKind.Token) {
          useGemma.setState((s) => ({ response: s.response + evt.text }));
        } else if (evt.kind === GemmaStreamKind.ToolCall) {
          addToolCard(evt.toolCall);
        } else if (evt.kind === GemmaStreamKind.ToolResult) {
          const { id, ok, summary } = evt.toolResult;
          // A denial keeps its 'denied' status set optimistically in respondGemmaTool.
          patchToolCard(id, {
            status: ok ? 'done' : useGemma.getState().tools.find((t) => t.id === id)?.status === 'denied' ? 'denied' : 'error',
            result: summary,
          });
        } else if (evt.kind === GemmaStreamKind.Error) {
          useGemma.setState({ error: evt.text, streaming: false });
        } else if (evt.kind === GemmaStreamKind.Done) {
          useGemma.setState({ streaming: false });
        }
      },
      onError: (err) => useGemma.setState({ error: err.message, streaming: false }),
      onComplete: () => useGemma.setState({ streaming: false }),
    },
  );
}

/** Approve or deny a pending tool confirmation card. */
export function respondGemmaTool(id: string, approved: boolean): void {
  patchToolCard(id, { status: approved ? 'running' : 'denied' });
  void trpc().gemma.respondTool.mutate({ id, approved });
}
