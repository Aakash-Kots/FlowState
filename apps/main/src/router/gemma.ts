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
  type GemmaStreamEvent,
  type ModelDiskInfo,
  type ModelStatus,
  modelDiskInfoSchema,
  modelStatusSchema,
} from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { gemmaService } from '../services/gemma';
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
  /** Stream a reply to `prompt`. Emits token chunks, then a done/error event. */
  ask: publicProcedure.input(z.object({ prompt: z.string().min(1) })).subscription(({ input }) =>
    observable<GemmaStreamEvent>((emit) => {
      const abort = new AbortController();
      gemmaService
        .generate(input.prompt, (text) => emit.next({ kind: GemmaStreamKind.Token, text }), abort.signal)
        .then(() => emit.next({ kind: GemmaStreamKind.Done, text: '' }))
        .catch((err) =>
          emit.next({ kind: GemmaStreamKind.Error, text: err instanceof Error ? err.message : 'Generation failed.' }),
        )
        .finally(() => emit.complete());
      // Client unsubscribed (palette closed / new prompt) → stop generating.
      return () => abort.abort();
    }),
  ),

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
