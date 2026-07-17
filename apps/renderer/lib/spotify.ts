'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import {
  SPOTIFY_POLL_INTERVAL_MS,
  type SpotifyPlaybackState,
  type SpotifyTrack,
} from '@flowstate/shared';
import { useWindowActive } from './hooks/useWindowActive';
import { useOnboarding } from './onboarding';
import { trpc } from './trpc';

///////////
// Types //
///////////

type SpotifyStoreState = {
  /** The latest player snapshot, or null before the first fetch. */
  playback: SpotifyPlaybackState | null;
  playbackLoading: boolean;
  /** Error from the last playback/transport call (e.g. "no active device"). */
  playbackError: string | null;

  //// Search box. ////
  searchQuery: string;
  searchResults: SpotifyTrack[];
  searching: boolean;
  searchError: string | null;
};

///////////////
// Constants //
///////////////

const INITIAL: SpotifyStoreState = {
  playback: null,
  playbackLoading: false,
  playbackError: null,
  searchQuery: '',
  searchResults: [],
  searching: false,
  searchError: null,
};

/** Debounce window for the search box before it hits the API. */
const SEARCH_DEBOUNCE_MS = 300;

/////////////
// Helpers //
/////////////

export const useSpotify = create<SpotifyStoreState>(() => INITIAL);

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

/////////////
// Actions //
/////////////

/** Fetch the current player snapshot into the store. */
export async function refreshPlayback(): Promise<void> {
  useSpotify.setState({ playbackLoading: true });
  try {
    const playback = await trpc().spotify.playbackState.query();
    useSpotify.setState({ playback, playbackLoading: false, playbackError: null });
  } catch (err) {
    useSpotify.setState({ playbackLoading: false, playbackError: message(err) });
  }
}

/** Run a transport mutation, then refresh so the UI reflects the new state. */
async function transport(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    useSpotify.setState({ playbackError: null });
  } catch (err) {
    useSpotify.setState({ playbackError: message(err) });
  }
  await refreshPlayback();
}

export function togglePlay(): Promise<void> {
  const { playback } = useSpotify.getState();
  return transport(() =>
    playback?.isPlaying ? trpc().spotify.pause.mutate() : trpc().spotify.play.mutate(),
  );
}

export function nextTrack(): Promise<void> {
  return transport(() => trpc().spotify.next.mutate());
}

export function previousTrack(): Promise<void> {
  return transport(() => trpc().spotify.previous.mutate());
}

export function playTrack(uri: string): Promise<void> {
  return transport(() => trpc().spotify.playTrack.mutate({ uri }));
}

/** Set the search text and (debounced) refetch results; empty clears them. */
export function setSearchQuery(query: string): void {
  useSpotify.setState({ searchQuery: query });
  if (searchTimer) clearTimeout(searchTimer);
  const trimmed = query.trim();
  if (!trimmed) {
    useSpotify.setState({ searchResults: [], searching: false, searchError: null });
    return;
  }
  useSpotify.setState({ searching: true });
  searchTimer = setTimeout(() => {
    void runSearch(trimmed);
  }, SEARCH_DEBOUNCE_MS);
}

async function runSearch(query: string): Promise<void> {
  try {
    const { tracks } = await trpc().spotify.search.query({ query });
    // Ignore a stale response if the query changed while in flight.
    if (useSpotify.getState().searchQuery.trim() !== query) return;
    useSpotify.setState({ searchResults: tracks, searching: false, searchError: null });
  } catch (err) {
    useSpotify.setState({ searching: false, searchError: message(err) });
  }
}

//////////
// Sync //
//////////

/**
 * While `active` and Spotify is connected, poll the player snapshot so the
 * now-playing card, header waveform, and transport buttons stay live. Polling
 * only runs while the app window is focused and visible — it pauses when the
 * window is hidden or blurred (and refetches immediately on return), so we
 * don't hit the Spotify API when the user isn't looking at FlowState. Cadence
 * is `SPOTIFY_POLL_INTERVAL_MS`.
 */
export function useSpotifySync(active: boolean): void {
  const connected = useOnboarding((s) => s.spotifyConnected);
  const windowActive = useWindowActive();
  useEffect(() => {
    if (!active || !connected || !windowActive) return;
    void refreshPlayback();
    const intervalId = setInterval(() => void refreshPlayback(), SPOTIFY_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [active, connected, windowActive]);
}
