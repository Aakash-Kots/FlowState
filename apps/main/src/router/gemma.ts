/**
 * Ask-Gemini control plane — a thin door over `geminiService` (the hosted
 * generative model). `ask` streams a reply token-by-token over a subscription
 * (aborting generation if the client unsubscribes); `modelStatus` +
 * `onModelProgress` drive the palette's ready/needs-API-key indicator;
 * `transcribe` turns a recorded audio clip into text for the mic button.
 */
import { observable } from '@trpc/server/observable';
import {
  GemmaStreamKind,
  type GemmaStreamEvent,
  type ModelStatus,
  gemmaAskInputSchema,
  modelStatusSchema,
  respondGemmaToolInputSchema,
  transcribeAudioInputSchema,
} from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { geminiService } from '../services/gemini';
import { getWorkspace } from '../store';
import { publicProcedure, router } from '../trpc';

export const gemmaRouter = router({
  /**
   * Stream a reply to `prompt`. Emits token chunks and tool-call/result events,
   * then a done/error event. `context` carries the user's current focus so tools
   * (e.g. create a worktree) can default their target.
   */
  ask: publicProcedure.input(gemmaAskInputSchema).subscription(({ input }) =>
    observable<GemmaStreamEvent>((emit) => {
      const abort = new AbortController();
      // Resolve the active project from the active workspace when the client
      // didn't pass one explicitly, so worktree tools have a default target.
      const activeWorkspaceId = input.context?.activeWorkspaceId ?? null;
      const activeProjectId =
        input.context?.activeProjectId ??
        (activeWorkspaceId ? (getWorkspace(activeWorkspaceId)?.projectId ?? null) : null);
      geminiService
        .generate(
          input.prompt,
          { activeProjectId, activeWorkspaceId },
          {
            onToken: (text) => emit.next({ kind: GemmaStreamKind.Token, text }),
            onToolCall: (toolCall) => emit.next({ kind: GemmaStreamKind.ToolCall, toolCall }),
            onToolResult: (toolResult) => emit.next({ kind: GemmaStreamKind.ToolResult, toolResult }),
          },
          abort.signal,
        )
        .then(() => emit.next({ kind: GemmaStreamKind.Done, text: '' }))
        .catch((err) =>
          emit.next({ kind: GemmaStreamKind.Error, text: err instanceof Error ? err.message : 'Generation failed.' }),
        )
        .finally(() => emit.complete());
      // Client unsubscribed (palette closed / new prompt) → stop generating.
      return () => abort.abort();
    }),
  ),

  /** Answer a pending tool confirmation (approve/deny, optionally with edited args). */
  respondTool: publicProcedure.input(respondGemmaToolInputSchema).mutation(({ input }) => {
    geminiService.respondTool(input);
  }),

  /** Transcribe a recorded audio clip to text (the mic → speech-to-text button). */
  transcribe: publicProcedure.input(transcribeAudioInputSchema).mutation(async ({ input }) => {
    try {
      return await geminiService.transcribe(input.audioBase64, input.mimeType);
    } catch (err) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Transcription failed.',
      });
    }
  }),

  /** Whether an API key is set (Ready) or not (Absent) — polled on palette open. */
  modelStatus: publicProcedure.query((): ModelStatus => modelStatusSchema.parse(geminiService.getStatus())),

  /** Live status stream: seeds with the current status, then pushes changes
   * (e.g. when the API key is saved or cleared in settings). */
  onModelProgress: publicProcedure.subscription(() =>
    observable<ModelStatus>((emit) => {
      emit.next(geminiService.getStatus());
      return geminiService.onStatus((status) => emit.next(status));
    }),
  ),
});
