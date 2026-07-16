/**
 * The activity ledger's payload shapes — one variant per {@link ActivityType}.
 * A row's `type` column mirrors the payload's `type` discriminant (kept for
 * cheap SQL filtering/indexing); the full payload is persisted as JSON in the
 * `data` column. Runtime validation lives in `../schemas/activity`.
 */
import type { ActivityType } from '../enums/activity';

///////////
// Types //
///////////

/** A commit made from FlowState's changes view. Line counts come from the commit summary. */
export type GitCommitData = {
  type: ActivityType.GitCommit;
  hash: string;
  summary: string;
  insertions: number;
  deletions: number;
  filesChanged: number;
};

/** A tracked Setup/Run terminal script that ran to completion. */
export type TerminalRunData = {
  type: ActivityType.TerminalRun;
  command: string;
  /** The terminal tab's kind ('setup' | 'run' | 'shell'); stored as text. */
  kind: string;
  exitCode: number;
  durationMs: number;
};

/** A linked Linear issue changing workflow state. */
export type LinearTransitionData = {
  type: ActivityType.LinearTransition;
  issueId: string;
  identifier: string;
  toState: string;
  fromState: string | null;
};

/** A Spotify track that started playing. */
export type SpotifyPlayData = {
  type: ActivityType.SpotifyPlay;
  trackId: string;
  trackName: string;
  artist: string;
  durationMs: number;
};

/** The persisted payload — a discriminated union keyed by `type`. */
export type ActivityData =
  | GitCommitData
  | TerminalRunData
  | LinearTransitionData
  | SpotifyPlayData;

/**
 * One recorded activity. `workspaceId`/`projectId` are denormalized text (no FK)
 * so the ledger outlives the rows it references, mirroring `usage_events`.
 */
export type ActivityEvent = {
  id: number;
  type: ActivityType;
  workspaceId: string | null;
  projectId: string | null;
  data: ActivityData;
  createdAt: string;
};

/** An activity to record — the persisted shape minus the autoincrement `id` and
 * the derived `type` column (taken from `data.type`). */
export type NewActivityEvent = {
  workspaceId: string | null;
  projectId: string | null;
  data: ActivityData;
  createdAt: string;
};
