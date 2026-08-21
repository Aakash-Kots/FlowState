/**
 * The persisted shape of a cached ticket embedding (main process). Lives here,
 * not in `@flowstate/shared`, because embeddings never leave the main process —
 * the renderer only ever sees ranked `SemanticHit`s over tRPC. Validation lives
 * in `../schemas/embeddings`.
 */
import type { LocalModelId } from '../enums/local-model';

/**
 * One ticket's cached vector. `vector` is L2-normalized and `dim` long; `model`
 * is the id that produced it and `contentHash` fingerprints the embedded text so
 * the reindexer can skip unchanged tickets. `updatedAt` is epoch ms.
 */
export type IssueEmbedding = {
  issueId: string;
  teamId: string;
  identifier: string;
  title: string;
  model: LocalModelId;
  dim: number;
  contentHash: string;
  vector: Float32Array;
  updatedAt: number;
};
