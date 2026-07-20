/**
 * Ask-Gemma control plane — a thin door over `gemmaService` (the on-device
 * generative model). `ask` streams a reply token-by-token over a subscription
 * (aborting generation if the client unsubscribes); `modelStatus` +
 * `onModelProgress` drive the palette's download/loading indicator; `modelInfo`
 * + `deleteModel` back the settings disk controls.
 */
import { observable } from '@trpc/server/observable';
import {
  GemmaStreamKind,
  type GemmaPrefs,
  type GemmaStreamEvent,
  type ModelDiskInfo,
  type ModelStatus,
  gemmaAskInputSchema,
  gemmaPrefsSchema,
  modelDiskInfoSchema,
  modelStatusSchema,
  respondGemmaToolInputSchema,
  setGemmaTierInputSchema,
} from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { gemmaService } from '../services/gemma';
import { getWorkspace } from '../store';
import { getGemmaTierPreference, setGemmaTierPreference } from '../store/settings';
import { publicProcedure, router } from '../trpc';

async function guard<T>(fn: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: err instanceof Error ? err.message : fallback,
    });
  }
}

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
      gemmaService
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
    gemmaService.respondTool(input);
  }),

  /** The user's generative-tier preference (Auto or a forced tier). */
  prefs: publicProcedure.query((): GemmaPrefs =>
    gemmaPrefsSchema.parse({ tierPreference: getGemmaTierPreference() }),
  ),

  /** Override which Gemma tier the palette runs; unloads so the next ask reloads
   * the chosen tier/quant. */
  setTierPreference: publicProcedure.input(setGemmaTierInputSchema).mutation(({ input }) => {
    setGemmaTierPreference(input.preference);
    void gemmaService.reload();
  }),

  /** The generative model's download/load state (polled on palette open). */
  modelStatus: publicProcedure.query((): ModelStatus => modelStatusSchema.parse(gemmaService.getStatus())),

  /** Live model-state stream: seeds with the current status, then pushes changes. */
  onModelProgress: publicProcedure.subscription(() =>
    observable<ModelStatus>((emit) => {
      emit.next(gemmaService.getStatus());
      return gemmaService.onStatus((status) => emit.next(status));
    }),
  ),

  /** On-disk footprint of the generative weights (for the settings UI). */
  modelInfo: publicProcedure.query((): Promise<ModelDiskInfo> =>
    guard(async () => modelDiskInfoSchema.parse(await gemmaService.getDiskInfo()), 'Failed to read model info.'),
  ),

  /** Delete the downloaded generative weights, reclaiming the disk. */
  deleteModel: publicProcedure.mutation((): Promise<ModelDiskInfo> =>
    guard(async () => modelDiskInfoSchema.parse(await gemmaService.deleteModel()), 'Failed to delete model.'),
  ),
});
