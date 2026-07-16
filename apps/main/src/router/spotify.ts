/**
 * Spotify control plane — a thin door over `spotifyService`. Powers the header
 * player: read the now-playing state, transport controls, search tracks, and
 * play a chosen track on the active Connect device. Auth (login/logout) lives on
 * the onboarding router / AuthService.
 */
import {
  type SpotifyPlaybackState,
  type SpotifySearchResult,
  playTrackInputSchema,
  searchTracksInputSchema,
  spotifyPlaybackStateSchema,
  spotifySearchResultSchema,
} from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { spotifyService } from '../services/spotify';
import { publicProcedure, router } from '../trpc';

/** Wrap a Spotify call, surfacing its message as an INTERNAL_SERVER_ERROR. */
async function guard<T>(fn: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: err instanceof Error ? err.message : fallback,
    });
  }
}

export const spotifyRouter = router({
  /** The current player snapshot (idle state when no device is active). */
  playbackState: publicProcedure.query((): Promise<SpotifyPlaybackState> =>
    guard(
      async () => spotifyPlaybackStateSchema.parse(await spotifyService.getPlaybackState()),
      'Failed to read Spotify playback state.',
    ),
  ),

  /** Resume playback on the active device. */
  play: publicProcedure.mutation(() =>
    guard(async () => spotifyService.play(), 'Failed to start playback.'),
  ),

  /** Pause playback on the active device. */
  pause: publicProcedure.mutation(() =>
    guard(async () => spotifyService.pause(), 'Failed to pause playback.'),
  ),

  /** Skip to the next track. */
  next: publicProcedure.mutation(() =>
    guard(async () => spotifyService.next(), 'Failed to skip to the next track.'),
  ),

  /** Skip to the previous track. */
  previous: publicProcedure.mutation(() =>
    guard(async () => spotifyService.previous(), 'Failed to skip to the previous track.'),
  ),

  /** Play a specific track (by URI) on the active device. */
  playTrack: publicProcedure
    .input(playTrackInputSchema)
    .mutation(({ input }) =>
      guard(async () => spotifyService.playTrack(input.uri), 'Failed to play the track.'),
    ),

  /** Search tracks by free text — works without an active device. */
  search: publicProcedure
    .input(searchTracksInputSchema)
    .query(({ input }): Promise<SpotifySearchResult> =>
      guard(
        async () => spotifySearchResultSchema.parse(await spotifyService.search(input.query)),
        'Failed to search Spotify.',
      ),
    ),
});
