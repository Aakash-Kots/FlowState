/**
 * Runtime validation for the cached ticket-embedding row (main process). Mirrors
 * `../types/embeddings`; the embeddings store `.parse()`es rows on read so a
 * corrupt SQLite row can never flow into the cosine ranker.
 */
import { z } from 'zod';
import { LocalModelId } from '../enums/local-model';
import type { IssueEmbedding } from '../types/embeddings';

export const issueEmbeddingSchema: z.ZodType<IssueEmbedding> = z.object({
  issueId: z.string(),
  teamId: z.string(),
  identifier: z.string(),
  title: z.string(),
  model: z.nativeEnum(LocalModelId),
  dim: z.number().int().positive(),
  contentHash: z.string(),
  vector: z.instanceof(Float32Array),
  updatedAt: z.number().int().nonnegative(),
});
