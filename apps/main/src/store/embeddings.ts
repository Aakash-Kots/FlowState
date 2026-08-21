/**
 * Persistence for cached ticket embeddings — the local semantic-search index.
 * One row per Linear ticket per team, keyed by issue id. The embedding service
 * writes vectors here after running EmbeddingGemma; the search service reads a
 * team's vectors back for brute-force cosine ranking. Rows are validated against
 * `issueEmbeddingSchema` on the way out, so a malformed blob can never reach the
 * ranker.
 *
 * Vectors are stored as raw little-endian Float32 buffers (SQLite blob) and
 * round-tripped through `Float32Array`. This is a derived cache of Linear API
 * data, not user state, so there's no workspace FK and it's safe to rebuild.
 */
import { issueEmbeddingSchema } from '../lib/schemas/embeddings';
import type { IssueEmbedding } from '../lib/types/embeddings';
import { and, eq, notInArray } from 'drizzle-orm';
import { getDb } from './db';
import { linearIssueEmbeddings } from './schema';

type EmbeddingRow = typeof linearIssueEmbeddings.$inferSelect;

/** Copy a SQLite blob into a standalone Float32Array (the row buffer may be a
 * view onto a pooled ArrayBuffer, so slice off its own backing store). */
function bufferToVector(buf: Buffer): Float32Array {
  const copy = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(copy);
}

/** A Float32Array's bytes as a Buffer for the blob column (no copy). */
function vectorToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

function rowToEmbedding(row: EmbeddingRow): IssueEmbedding {
  return issueEmbeddingSchema.parse({
    issueId: row.issueId,
    teamId: row.teamId,
    identifier: row.identifier,
    title: row.title,
    model: row.model,
    dim: row.dim,
    contentHash: row.contentHash,
    vector: bufferToVector(row.vector as Buffer),
    updatedAt: row.updatedAt,
  });
}

/** Every cached embedding for a team, for the cosine ranker. */
export function getIssueEmbeddingsByTeam(teamId: string): IssueEmbedding[] {
  return getDb()
    .select()
    .from(linearIssueEmbeddings)
    .where(eq(linearIssueEmbeddings.teamId, teamId))
    .all()
    .map(rowToEmbedding);
}

/** Every cached embedding across all teams — the account-wide corpus the ⌘P
 * palette ranks against when no single team is in scope. */
export function getAllIssueEmbeddings(): IssueEmbedding[] {
  return getDb().select().from(linearIssueEmbeddings).all().map(rowToEmbedding);
}

/**
 * The `issueId → contentHash` map for a team, without decoding vectors — lets
 * the reindexer diff which tickets changed before doing any embedding work.
 */
export function getEmbeddingHashesByTeam(teamId: string): Map<string, string> {
  const rows = getDb()
    .select({ issueId: linearIssueEmbeddings.issueId, contentHash: linearIssueEmbeddings.contentHash })
    .from(linearIssueEmbeddings)
    .where(eq(linearIssueEmbeddings.teamId, teamId))
    .all();
  return new Map(rows.map((r) => [r.issueId, r.contentHash]));
}

/** Upsert a batch of freshly-computed embeddings (issue id is the conflict key). */
export function upsertIssueEmbeddings(embeddings: IssueEmbedding[]): void {
  if (embeddings.length === 0) return;
  const db = getDb();
  db.transaction((tx) => {
    for (const e of embeddings) {
      const values = {
        issueId: e.issueId,
        teamId: e.teamId,
        identifier: e.identifier,
        title: e.title,
        model: e.model,
        dim: e.dim,
        contentHash: e.contentHash,
        vector: vectorToBuffer(e.vector),
        updatedAt: e.updatedAt,
      };
      tx.insert(linearIssueEmbeddings)
        .values(values)
        .onConflictDoUpdate({
          target: linearIssueEmbeddings.issueId,
          set: {
            teamId: values.teamId,
            identifier: values.identifier,
            title: values.title,
            model: values.model,
            dim: values.dim,
            contentHash: values.contentHash,
            vector: values.vector,
            updatedAt: values.updatedAt,
          },
        })
        .run();
    }
  });
}

/**
 * Drop a team's embeddings for tickets no longer present (`keepIds` is the live
 * set from the last fetch). With an empty `keepIds` the whole team is cleared.
 */
export function pruneIssueEmbeddings(teamId: string, keepIds: string[]): void {
  const db = getDb();
  if (keepIds.length === 0) {
    db.delete(linearIssueEmbeddings).where(eq(linearIssueEmbeddings.teamId, teamId)).run();
    return;
  }
  db.delete(linearIssueEmbeddings)
    .where(and(eq(linearIssueEmbeddings.teamId, teamId), notInArray(linearIssueEmbeddings.issueId, keepIds)))
    .run();
}
