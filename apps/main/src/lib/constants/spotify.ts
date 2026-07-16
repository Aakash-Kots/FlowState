/**
 * Spotify OAuth + Web API constants (main-process only). Spotify implements the
 * Authorization Code flow **with PKCE**, so no `client_secret` is required or
 * shipped — a `code_verifier`/`code_challenge` (S256) pair is used instead.
 * Redirect URIs must exact-match a pre-registered loopback URL, hence a fixed
 * port. Access tokens expire in ~1h and come with a refresh token, so there is a
 * refresh flow (see `services/spotify`). The client id is injected at build time
 * via electron-vite `define` (see electron.vite.config).
 */

export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

/**
 * Space-separated scopes: read + control playback on the user's devices. The
 * `streaming` scope is requested now so a later in-app Web Playback SDK upgrade
 * needs no re-consent.
 */
export const SPOTIFY_OAUTH_SCOPES =
  'user-read-playback-state user-modify-playback-state user-read-currently-playing streaming';

/** Fixed, uncommon loopback port — must match the callback registered in the Spotify app. */
export const SPOTIFY_REDIRECT_PORT = 52848;
export const SPOTIFY_REDIRECT_PATH = '/callback';

/** How long to wait for the browser round-trip before giving up (mirrors auth.ts). */
export const SPOTIFY_OAUTH_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * The redirect URI passed to Spotify — identical in dev and packaged builds.
 * Spotify requires `127.0.0.1` (not `localhost`) for loopback redirects.
 */
export const spotifyRedirectUri = (): string =>
  `http://127.0.0.1:${SPOTIFY_REDIRECT_PORT}${SPOTIFY_REDIRECT_PATH}`;

/** OAuth client id, inlined at build time (empty in dev without a .env). No secret with PKCE. */
export const SPOTIFY_CLIENT_ID: string = process.env.SPOTIFY_CLIENT_ID ?? '';
