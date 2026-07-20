/**
 * Runtime validation for the semantic-search domain. Mirrors `../types/search`;
 * the search router `.parse()`es inputs at the IPC boundary and re-validates the
 * results it returns.
 */
import { z } from 'zod';
import { LocalModelState } from '../enums/search';
import type {
  ModelStatus,
  ReindexInput,
  ReindexResult,
  SemanticHit,
  SemanticSearchInput,
  SemanticSearchResult,
} from '../types/search';

export const semanticSearchInputSchema: z.ZodType<SemanticSearchInput> = z.object({
  query: z.string(),
  teamId: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

export const semanticHitSchema: z.ZodType<SemanticHit> = z.object({
  issueId: z.string(),
  identifier: z.string(),
  title: z.string(),
  score: z.number(),
});

export const semanticSearchResultSchema: z.ZodType<SemanticSearchResult> = z.object({
  hits: z.array(semanticHitSchema),
  modelReady: z.boolean(),
});

export const reindexInputSchema: z.ZodType<ReindexInput> = z.object({
  teamId: z.string(),
});

export const reindexResultSchema: z.ZodType<ReindexResult> = z.object({
  embedded: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const modelStatusSchema: z.ZodType<ModelStatus> = z.object({
  state: z.nativeEnum(LocalModelState),
  downloadProgress: z.number().nullable(),
  modelId: z.string(),
  error: z.string().nullable(),
});
