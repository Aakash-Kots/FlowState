'use client';

import { create } from 'zustand';
import { GemmaStreamKind, type ModelStatus } from '@flowstate/shared';
import { trpc } from './trpc';

///////////
// Types //
///////////

type Unsub = { unsubscribe: () => void };

type GemmaState = {
  /** Whether the Ask-Gemma palette is open. */
  open: boolean;
  /** The prompt currently being answered (shown above the reply). */
  prompt: string;
  /** The streamed reply so far. */
  response: string;
  /** True while tokens are still arriving. */
  streaming: boolean;
  error: string | null;
  /** The generative model's download/load state, for the prep indicator. */
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

/////////////
// Actions //
/////////////

/** Open the palette (fresh), and start watching model-download progress. */
export function openAskGemma(): void {
  sub?.unsubscribe();
  sub = null;
  useGemma.setState({ open: true, prompt: '', response: '', error: null, streaming: false });
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
  useGemma.setState({ prompt: '', response: '', error: null, streaming: false });
}

/**
 * Ask Gemma `prompt` and stream the reply into the store. Cancels any previous
 * generation first. Downloads/loads the model on first use (the palette shows
 * the progress meanwhile via `modelStatus`).
 */
export function askGemma(prompt: string): void {
  const q = prompt.trim();
  if (!q) return;
  sub?.unsubscribe();
  useGemma.setState({ prompt: q, response: '', error: null, streaming: true });
  sub = trpc().gemma.ask.subscribe(
    { prompt: q },
    {
      onData: (evt) => {
        if (evt.kind === GemmaStreamKind.Token) {
          useGemma.setState((s) => ({ response: s.response + evt.text }));
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
