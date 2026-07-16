/**
 * Runtime validation for the activity ledger. Mirrors `../types/activity`;
 * `activityDataSchema` validates a payload before it's written (and after it's
 * read back out of the `data` JSON column).
 */
import { z } from 'zod';
import { ActivityType } from '../enums/activity';
import type { ActivityData, NewActivityEvent } from '../types/activity';

// Members are left un-annotated so they stay `ZodObject`s — `discriminatedUnion`
// needs the concrete object shape (a plain `z.ZodType` would erase it). Their
// inferred output already equals the hand-declared payload types.
const gitCommitDataSchema = z.object({
  type: z.literal(ActivityType.GitCommit),
  hash: z.string(),
  summary: z.string(),
  insertions: z.number(),
  deletions: z.number(),
  filesChanged: z.number(),
});

const terminalRunDataSchema = z.object({
  type: z.literal(ActivityType.TerminalRun),
  command: z.string(),
  kind: z.string(),
  exitCode: z.number(),
  durationMs: z.number(),
});

const linearTransitionDataSchema = z.object({
  type: z.literal(ActivityType.LinearTransition),
  issueId: z.string(),
  identifier: z.string(),
  toState: z.string(),
  fromState: z.string().nullable(),
});

const spotifyPlayDataSchema = z.object({
  type: z.literal(ActivityType.SpotifyPlay),
  trackId: z.string(),
  trackName: z.string(),
  artist: z.string(),
  durationMs: z.number(),
});

/** Validates any activity payload, narrowing on the `type` discriminant. */
export const activityDataSchema: z.ZodType<ActivityData> = z.discriminatedUnion('type', [
  gitCommitDataSchema,
  terminalRunDataSchema,
  linearTransitionDataSchema,
  spotifyPlayDataSchema,
]);

/** Validates a new ledger row at the store boundary before insert. */
export const newActivityEventSchema: z.ZodType<NewActivityEvent> = z.object({
  workspaceId: z.string().nullable(),
  projectId: z.string().nullable(),
  data: activityDataSchema,
  createdAt: z.string().datetime(),
});
