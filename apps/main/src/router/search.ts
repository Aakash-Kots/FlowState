/**
 * Semantic-search control plane — a thin door over `searchService` and the local
 * embedding model. `semantic` ranks a team's tickets against a natural-language
 * query; `reindex` refreshes the local vector cache; `modelStatus` +
 * `onModelProgress` drive the search box's "preparing smart search…" affordance
 * as the model downloads and loads. Mirrors the mutations + observable split used
 * by the claude/terminal routers.
 */
import { observable } from '@trpc/server/observable';
import {
  type ModelDiskInfo,
  type ModelStatus,
  type ReindexResult,
  type SearchPrefs,
  type SemanticSearchResult,
  modelDiskInfoSchema,
  modelStatusSchema,
  reindexInputSchema,
  reindexResultSchema,
  searchPrefsSchema,
  semanticSearchInputSchema,
  semanticSearchResultSchema,
} from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { localModelService } from '../services/local-model';
import { searchService } from '../services/search';
import {
  getPreferSmallModel,
  getSemanticSearchEnabled,
  setPreferSmallModel,
  setSemanticSearchEnabled,
} from '../store/settings';
import { publicProcedure, router } from '../trpc';

/** Wrap a search call, surfacing its message as an INTERNAL_SERVER_ERROR. */
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

export const searchRouter = router({
  /** Natural-language ranking of a team's tickets by embedding similarity. */
  semantic: publicProcedure.input(semanticSearchInputSchema).query(({ input }): Promise<SemanticSearchResult> =>
    guard(async () => semanticSearchResultSchema.parse(await searchService.semantic(input)), 'Semantic search failed.'),
  ),

  /** (Re)embed a team's tickets into the local index (incremental, single-flight). */
  reindex: publicProcedure.input(reindexInputSchema).mutation(({ input }): Promise<ReindexResult> =>
    guard(async () => reindexResultSchema.parse(await searchService.reindexTeam(input.teamId)), 'Reindex failed.'),
  ),

  /** Index every team in the background so search works before a team is picked
   * (and ⌘P spans the whole backlog). Fire-and-forget. */
  reindexAll: publicProcedure.mutation(() => {
    void searchService.reindexAllTeams();
  }),

  /** The embedding model's current download/load state (polled on mount). */
  modelStatus: publicProcedure.query((): ModelStatus => modelStatusSchema.parse(localModelService.getStatus())),

  /** Live model-state stream: seeds with the current status, then pushes changes. */
  onModelProgress: publicProcedure.subscription(() =>
    observable<ModelStatus>((emit) => {
      emit.next(localModelService.getStatus());
      return localModelService.onStatus((status) => emit.next(status));
    }),
  ),

  /** User controls for semantic search (enable + small-model preference). */
  prefs: publicProcedure.query((): SearchPrefs =>
    searchPrefsSchema.parse({ enabled: getSemanticSearchEnabled(), preferSmallModel: getPreferSmallModel() }),
  ),

  setEnabled: publicProcedure.input(z.object({ enabled: z.boolean() })).mutation(({ input }) => {
    setSemanticSearchEnabled(input.enabled);
    // Turning it off frees memory immediately; the weights stay on disk until
    // the user deletes them explicitly.
    if (!input.enabled) void localModelService.reload();
  }),

  setPreferSmallModel: publicProcedure.input(z.object({ prefer: z.boolean() })).mutation(({ input }) => {
    setPreferSmallModel(input.prefer);
    // The chosen quant/width changed — unload so the next search re-selects.
    void localModelService.reload();
  }),

  /** On-disk footprint of the downloaded weights (for the settings UI). */
  modelInfo: publicProcedure.query((): Promise<ModelDiskInfo> =>
    guard(async () => modelDiskInfoSchema.parse(await localModelService.getDiskInfo()), 'Failed to read model info.'),
  ),

  /** Delete the downloaded weights, reclaiming the disk. Returns the new (empty) info. */
  deleteModel: publicProcedure.mutation((): Promise<ModelDiskInfo> =>
    guard(async () => modelDiskInfoSchema.parse(await localModelService.deleteModel()), 'Failed to delete model.'),
  ),
});
