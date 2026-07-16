/**
 * Runtime validation for the Spotify domain. Mirrors `../types/spotify`.
 */
import { z } from 'zod';
import { SpotifyRepeatState } from '../enums/spotify';
import type {
  PlayTrackInput,
  SearchTracksInput,
  SpotifyPlaybackState,
  SpotifySearchResult,
  SpotifyTrack,
} from '../types/spotify';

export const spotifyTrackSchema: z.ZodType<SpotifyTrack> = z.object({
  id: z.string(),
  uri: z.string(),
  name: z.string(),
  artists: z.array(z.string()),
  albumArtUrl: z.string().url().nullable(),
  durationMs: z.number(),
});

export const spotifyPlaybackStateSchema: z.ZodType<SpotifyPlaybackState> = z.object({
  isPlaying: z.boolean(),
  track: spotifyTrackSchema.nullable(),
  deviceName: z.string().nullable(),
  progressMs: z.number(),
  repeatState: z.nativeEnum(SpotifyRepeatState),
  shuffle: z.boolean(),
});

export const spotifySearchResultSchema: z.ZodType<SpotifySearchResult> = z.object({
  tracks: z.array(spotifyTrackSchema),
});

export const searchTracksInputSchema: z.ZodType<SearchTracksInput> = z.object({
  query: z.string().min(1),
});

export const playTrackInputSchema: z.ZodType<PlayTrackInput> = z.object({
  uri: z.string().min(1),
});
