/**
 * Types for semantic search over Linear tickets — the tRPC request/response
 * shapes that cross the IPC boundary between the renderer's search box and the
 * main process's local embedding model. Validation lives in `../schemas/search`.
 */
import type { LocalModelState } from '../enums/search';

/**
 * A natural-language search request. `teamId` scopes the corpus to one Linear
 * team (the browser's selected team); omit for the account-wide index. `limit`
 * caps the returned hits.
 */
export type SemanticSearchInput = {
  query: string;
  teamId?: string;
  limit?: number;
};

/** One ranked ticket, carrying enough to render/label it without a live fetch. */
export type SemanticHit = {
  issueId: string;
  identifier: string;
  title: string;
  /** Cosine similarity in [-1, 1]; higher is more relevant. */
  score: number;
};

/**
 * Search results. `modelReady` is false when the model is still downloading or
 * loading — the renderer then shows progress (via `onModelProgress`) and re-runs
 * the query once the model reports `Ready`, rather than blocking the keystroke.
 */
export type SemanticSearchResult = {
  hits: SemanticHit[];
  modelReady: boolean;
};

/** Ask the main process to (re)embed a team's tickets into the local index. */
export type ReindexInput = {
  teamId: string;
};

/** Outcome of a reindex pass: how many tickets were (re)embedded of the total. */
export type ReindexResult = {
  embedded: number;
  total: number;
};

/**
 * The embedding model's current state, polled on mount and pushed over the
 * `onModelProgress` subscription. `downloadProgress` is a 0..1 fraction while
 * `state` is `Downloading`, else null; `error` carries the message when
 * `state` is `Error`.
 */
export type ModelStatus = {
  state: LocalModelState;
  downloadProgress: number | null;
  modelId: string;
  error: string | null;
};

/**
 * User controls for semantic search. `enabled` off fully disables it (no
 * download, no embedding — search falls back to literal). `preferSmallModel`
 * forces the smaller Q4 weights + a narrower vector regardless of RAM, trading a
 * little recall for ~80MB less disk and lower memory.
 */
export type SearchPrefs = {
  enabled: boolean;
  preferSmallModel: boolean;
};

/** On-disk footprint of the downloaded model weights, for the settings UI. */
export type ModelDiskInfo = {
  downloaded: boolean;
  bytes: number;
};
