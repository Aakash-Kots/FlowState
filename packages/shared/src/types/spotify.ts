/**
 * Spotify integration types. Validation lives in `../schemas/spotify`.
 *
 * FlowState controls playback on the user's active Spotify Connect device via
 * the Web API; these shapes are the minimal projection of Spotify's responses
 * the header player needs.
 */
import type { SpotifyRepeatState } from '../enums/spotify';

/**
 * A single track — the now-playing card and search results. Kept small: the
 * full track lives in Spotify, we store just enough to display and play it.
 */
export type SpotifyTrack = {
  id: string;
  /** Spotify URI, e.g. "spotify:track:4uLU6hMCjMI75M1A2tKUQC" — used to play it. */
  uri: string;
  name: string;
  /** Artist display names, in order. */
  artists: string[];
  /** Album cover URL (largest available), or null when Spotify returns none. */
  albumArtUrl: string | null;
  durationMs: number;
};

/**
 * The current player snapshot from `/me/player`. `track` is null when nothing is
 * loaded; `deviceName` is null when there is no active Connect device (the UI
 * then prompts the user to open Spotify).
 */
export type SpotifyPlaybackState = {
  isPlaying: boolean;
  track: SpotifyTrack | null;
  /** Active device name, or null when no device is playing. */
  deviceName: string | null;
  progressMs: number;
  repeatState: SpotifyRepeatState;
  shuffle: boolean;
};

/** Track search results (the header player's search box). */
export type SpotifySearchResult = {
  tracks: SpotifyTrack[];
};

/** Input to search tracks by free text. */
export type SearchTracksInput = {
  query: string;
};

/** Input to play a specific track on the active device. */
export type PlayTrackInput = {
  uri: string;
};
