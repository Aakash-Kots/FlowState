/**
 * SearchService — semantic search over Linear tickets, built on the local
 * embedding model (`localModelService`) and the `linear_issue_embeddings` cache.
 *
 * Two halves:
 * - **index** (`reindexTeam`): fetch a team's tickets from Linear, embed only the
 *   ones whose text changed since last time (diffed by content hash), and upsert
 *   their vectors. Cheap no-op when nothing changed; single-flight per team.
 * - **query** (`semantic`): embed the natural-language query, cosine-rank it
 *   against the team's cached vectors, and return the top matches. If the model
 *   isn't loaded yet it kicks off the one-time download and reports
 *   `modelReady: false` so the UI can wait rather than block the keystroke.
 *
 * The corpus is small (the Linear list query caps at the 100 most-recent tickets
 * per team — a v1 limit shared with the rest of the app), so cosine is a plain
 * brute-force dot product over normalized vectors — no vector index needed.
 */
import { createHash } from 'node:crypto';
import {
  type ReindexResult,
  type SemanticHit,
  type SemanticSearchInput,
  type SemanticSearchResult,
} from '@flowstate/shared';
import { SEARCH_EMBEDDING_MODEL, embedDocumentText } from '../lib/constants/local-model';
import { EmbedRole } from '../lib/enums/local-model';
import type { IssueEmbedding } from '../lib/types/embeddings';
import {
  getAllIssueEmbeddings,
  getEmbeddingHashesByTeam,
  getIssueEmbeddingsByTeam,
  pruneIssueEmbeddings,
  upsertIssueEmbeddings,
} from '../store/embeddings';
import { linearService } from './linear';
import { localModelService } from './local-model';

///////////////
// Constants //
///////////////

/** Max hits returned when the caller doesn't cap it. */
const DEFAULT_LIMIT = 25;
/** Drop matches below this cosine similarity — clearly-unrelated noise. */
const MIN_SCORE = 0.3;
/** Cap on embedded description length — bounds embedding time and stays within
 * the model's context window; the opening of a ticket body carries the gist. */
const DESCRIPTION_CHARS = 2000;

/////////////
// Helpers //
/////////////

/** A ticket's searchable text. The title anchors the doc frame; the body carries
 * the identifier + description so search matches meaning in the ticket, not just
 * its title (and a "ENG-142"-style reference still lands in the vector). */
type IndexableIssue = { identifier: string; title: string; description: string | null };

function documentText(issue: IndexableIssue): string {
  const body = `${issue.identifier}\n${(issue.description ?? '').slice(0, DESCRIPTION_CHARS)}`.trim();
  return embedDocumentText(issue.title, body);
}

/** Fingerprint of a ticket's embedded text — re-embed only when this changes. */
function contentHash(issue: IndexableIssue): string {
  return createHash('sha1').update(documentText(issue)).digest('hex');
}

/** Dot product of two equal-length normalized vectors (== cosine similarity). */
function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -1; // dim mismatch (spec changed) — skip
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

/////////////////
// SearchService //
/////////////////

export class SearchService {
  /** In-flight reindex per team, so concurrent triggers coalesce. */
  private reindexing = new Map<string, Promise<ReindexResult>>();

  /** (Re)embed a team's tickets into the local index. Single-flight per team. */
  reindexTeam(teamId: string): Promise<ReindexResult> {
    const existing = this.reindexing.get(teamId);
    if (existing) return existing;
    const run = this.doReindex(teamId).finally(() => this.reindexing.delete(teamId));
    this.reindexing.set(teamId, run);
    return run;
  }

  private async doReindex(teamId: string): Promise<ReindexResult> {
    const issues = await linearService.teamIssuesForIndex(teamId);
    const total = issues.length;
    const hashes = getEmbeddingHashesByTeam(teamId);

    const stale = issues.filter((i) => hashes.get(i.id) !== contentHash(i));
    if (stale.length > 0) {
      const vectors = await localModelService.embed(
        stale.map((i) => documentText(i)),
        EmbedRole.Document,
      );
      const model = localModelService.getSpec()?.modelId ?? SEARCH_EMBEDDING_MODEL;
      const now = Date.now();
      const rows: IssueEmbedding[] = [];
      for (let idx = 0; idx < stale.length; idx++) {
        const issue = stale[idx];
        const vector = vectors[idx];
        if (!issue || !vector) continue;
        rows.push({
          issueId: issue.id,
          teamId,
          identifier: issue.identifier,
          title: issue.title,
          model,
          dim: vector.length,
          contentHash: contentHash(issue),
          vector,
          updatedAt: now,
        });
      }
      upsertIssueEmbeddings(rows);
    }

    // Drop tickets that left the team's live set (closed/moved out of the window).
    pruneIssueEmbeddings(
      teamId,
      issues.map((i) => i.id),
    );
    return { embedded: stale.length, total };
  }

  /**
   * Rank cached tickets against a natural-language query. Scopes to one team when
   * `teamId` is given (the Linear tab), else ranks the whole indexed corpus (the
   * ⌘P palette). Returns empty (with `modelReady: false`) while the model is still
   * downloading/loading, and kicks a background reindex if a scoped team has no
   * vectors yet.
   */
  async semantic(input: SemanticSearchInput): Promise<SemanticSearchResult> {
    const query = input.query.trim();
    const teamId = input.teamId;
    if (!query) return { hits: [], modelReady: localModelService.isReady() };

    if (!localModelService.isReady()) {
      // Trigger the one-time download/load; the UI waits on the progress feed and
      // re-runs the query once the model reports Ready.
      void localModelService.ensureReady().catch(() => undefined);
      return { hits: [], modelReady: false };
    }

    const rows = teamId ? getIssueEmbeddingsByTeam(teamId) : getAllIssueEmbeddings();
    if (rows.length === 0) {
      // Nothing indexed yet for this scope. When scoped to a team, populate it in
      // the background; this query returns empty either way.
      if (teamId) void this.reindexTeam(teamId).catch(() => undefined);
      return { hits: [], modelReady: true };
    }

    const [queryVec] = await localModelService.embed([query], EmbedRole.Query);
    if (!queryVec) return { hits: [], modelReady: true };
    const limit = input.limit ?? DEFAULT_LIMIT;
    const hits: SemanticHit[] = rows
      .map((r) => ({ issueId: r.issueId, identifier: r.identifier, title: r.title, score: dot(queryVec, r.vector) }))
      .filter((h) => h.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return { hits, modelReady: true };
  }
}

/** Process-wide singleton (mirrors `linearService`, `claudeService`). */
export const searchService = new SearchService();
