/**
 * Client-side fuzzy matching for the search surfaces (the ⌘P palette and the
 * Linear tab's local filter). Kept dependency-free and synchronous so it can run
 * over thousands of candidates per keystroke without a worker.
 */

/////////////
// Helpers //
/////////////

/**
 * Score `text` against `query`, higher is a better match; returns `-1` when the
 * query is not even a subsequence of the text (i.e. no match). An empty query
 * matches everything with a neutral `0`. A contiguous substring always beats a
 * scattered subsequence, and earlier / tighter matches score higher — so callers
 * can sort by the returned score for "best first" ordering.
 */
export function fuzzyScore(text: string, query: string): number {
  if (!query) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  // Contiguous substring: the strongest signal — earlier position wins.
  const sub = t.indexOf(q);
  if (sub >= 0) return 2000 - sub;

  // Otherwise require an in-order subsequence, penalising the gaps between hits.
  let from = 0;
  let score = 1000;
  for (let i = 0; i < q.length; i++) {
    const at = t.indexOf(q[i], from);
    if (at === -1) return -1;
    score -= at - from;
    from = at + 1;
  }
  return score;
}
