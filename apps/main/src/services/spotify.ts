/**
 * SpotifyService — controls playback on the user's active Spotify Connect device
 * via the Web API, using the OAuth tokens captured on the Connect screen
 * (encrypted with Electron safeStorage). Powers the header player: read the
 * now-playing state, transport controls (play/pause/next/previous), search
 * tracks, and play a chosen track. Access tokens expire in ~1h, so this service
 * owns the refresh flow — it transparently mints a new access token from the
 * stored refresh token when the current one is near expiry. The auth flow itself
 * lives in `spotify-oauth.ts` / `AuthService`.
 *
 * Playback here means Spotify Connect (controlling an already-running device);
 * true in-app audio (the Web Playback SDK) is a later upgrade that would reuse
 * these same token mechanics.
 */
import {
  SpotifyRepeatState,
  type SpotifyPlaybackState,
  type SpotifySearchResult,
  type SpotifyTrack,
  SPOTIFY_SEARCH_LIMIT,
} from '@flowstate/shared';
import { SPOTIFY_API_BASE, SPOTIFY_CLIENT_ID, SPOTIFY_TOKEN_URL } from '../lib/constants/spotify';
import { SecretName } from '../lib/enums/secret';
import { deleteSecret, getSecret, setSecret } from '../store/secrets';
import { getSetting, setSetting } from '../store/settings';
import type { SpotifyOAuthResult } from './spotify-oauth';

///////////////
// Constants //
///////////////

/** Non-secret KV key for the current access token's expiry (epoch ms). */
const SPOTIFY_EXPIRES_AT_KEY = 'spotify.expiresAt';

/** Refresh the access token this many ms before it actually expires. */
const REFRESH_SKEW_MS = 60_000;

///////////
// Types //
///////////

/** Minimal shape of Spotify's track object (the fields we project). */
type SpotifyApiTrack = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { images: { url: string }[] };
};

/** Minimal shape of `GET /me/player`. */
type SpotifyApiPlayer = {
  is_playing: boolean;
  progress_ms: number | null;
  repeat_state: string;
  shuffle_state: boolean;
  device: { name: string } | null;
  item: SpotifyApiTrack | null;
};

/////////////
// Helpers //
/////////////

/** Map a raw Spotify track to our small `SpotifyTrack`. */
function toTrack(t: SpotifyApiTrack): SpotifyTrack {
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => a.name),
    // Album images are largest-first; take the first, or null when absent.
    albumArtUrl: t.album.images[0]?.url ?? null,
    durationMs: t.duration_ms,
  };
}

/** Coerce Spotify's `repeat_state` string into our mirror enum (tolerant fallback). */
function toRepeatState(raw: string): SpotifyRepeatState {
  return Object.values(SpotifyRepeatState).includes(raw as SpotifyRepeatState)
    ? (raw as SpotifyRepeatState)
    : SpotifyRepeatState.Off;
}

/** The idle snapshot returned when there is no active Connect device. */
function noDeviceState(): SpotifyPlaybackState {
  return {
    isPlaying: false,
    track: null,
    deviceName: null,
    progressMs: 0,
    repeatState: SpotifyRepeatState.Off,
    shuffle: false,
  };
}

////////////
// Export //
////////////

export class SpotifyService {
  /**
   * Persist a fresh set of tokens (called by AuthService after login and on
   * refresh). Keeps the expiry bookkeeping in one place.
   */
  persistTokens(result: SpotifyOAuthResult): void {
    setSecret(SecretName.SpotifyAccessToken, result.accessToken);
    setSecret(SecretName.SpotifyRefreshToken, result.refreshToken);
    setSetting(SPOTIFY_EXPIRES_AT_KEY, Date.now() + result.expiresIn * 1000);
  }

  /** Clear all persisted Spotify tokens/state (logout). */
  clearTokens(): void {
    deleteSecret(SecretName.SpotifyAccessToken);
    deleteSecret(SecretName.SpotifyRefreshToken);
    setSetting(SPOTIFY_EXPIRES_AT_KEY, 0);
  }

  /** A valid access token, refreshing transparently when near/at expiry. */
  private async token(): Promise<string> {
    const access = getSecret(SecretName.SpotifyAccessToken);
    const refresh = getSecret(SecretName.SpotifyRefreshToken);
    if (!access || !refresh) {
      throw new Error('No linked Spotify account. Connect Spotify from the Connect screen first.');
    }
    const expiresAt = getSetting<number>(SPOTIFY_EXPIRES_AT_KEY) ?? 0;
    if (Date.now() < expiresAt - REFRESH_SKEW_MS) return access;
    return this.refresh(refresh);
  }

  /** Exchange the refresh token for a new access token and persist it. */
  private async refresh(refreshToken: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
    });
    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`Spotify token refresh failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) throw new Error('Spotify token refresh returned no access_token.');
    setSecret(SecretName.SpotifyAccessToken, json.access_token);
    // Spotify may rotate the refresh token; keep the newest one if returned.
    if (json.refresh_token) setSecret(SecretName.SpotifyRefreshToken, json.refresh_token);
    setSetting(SPOTIFY_EXPIRES_AT_KEY, Date.now() + (json.expires_in ?? 3600) * 1000);
    return json.access_token;
  }

  /**
   * Authenticated Web API request. Returns the parsed JSON, or `null` for an
   * empty `204` body (Spotify's success response for transport commands and the
   * idle player). Throws a friendly error when there is no active device.
   */
  private async request<T>(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T | null> {
    const token = await this.token();
    const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 204 || res.status === 202) return null;
    if (res.status === 404) {
      // Spotify returns 404 / NO_ACTIVE_DEVICE when nothing is ready to control.
      throw new Error('No active Spotify device. Open Spotify on any device to start playing.');
    }
    if (!res.ok) {
      throw new Error(`Spotify API error (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  /** The current player snapshot, or the idle state when no device is active. */
  async getPlaybackState(): Promise<SpotifyPlaybackState> {
    const player = await this.request<SpotifyApiPlayer>('/me/player');
    if (!player || !player.device) return noDeviceState();
    return {
      isPlaying: player.is_playing,
      track: player.item ? toTrack(player.item) : null,
      deviceName: player.device.name,
      progressMs: player.progress_ms ?? 0,
      repeatState: toRepeatState(player.repeat_state),
      shuffle: player.shuffle_state,
    };
  }

  /** Resume playback on the active device. */
  async play(): Promise<void> {
    await this.request('/me/player/play', { method: 'PUT' });
  }

  /** Pause playback on the active device. */
  async pause(): Promise<void> {
    await this.request('/me/player/pause', { method: 'PUT' });
  }

  /** Skip to the next track. */
  async next(): Promise<void> {
    await this.request('/me/player/next', { method: 'POST' });
  }

  /** Skip to the previous track. */
  async previous(): Promise<void> {
    await this.request('/me/player/previous', { method: 'POST' });
  }

  /** Play a specific track (by URI) on the active device. */
  async playTrack(uri: string): Promise<void> {
    await this.request('/me/player/play', { method: 'PUT', body: { uris: [uri] } });
  }

  /** Search tracks by free text — works without an active device. */
  async search(query: string): Promise<SpotifySearchResult> {
    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: String(SPOTIFY_SEARCH_LIMIT),
    });
    const data = await this.request<{ tracks: { items: SpotifyApiTrack[] } }>(
      `/search?${params.toString()}`,
    );
    return { tracks: (data?.tracks.items ?? []).map(toTrack) };
  }
}

export const spotifyService = new SpotifyService();
