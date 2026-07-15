/**
 * Linear OAuth constants (main-process only). Linear implements a classic
 * confidential-client Authorization Code flow: PKCE is not supported, so a
 * `client_secret` is required, and redirect URIs must be pre-registered http(s)
 * URLs that exact-match — hence a fixed loopback port rather than an ephemeral
 * one. Tokens are long-lived with no refresh token, so there is no refresh flow;
 * logout is a local delete (optionally revoked). The client id/secret are
 * injected at build time via electron-vite `define` (see electron.vite.config).
 */

export const LINEAR_AUTHORIZE_URL = 'https://linear.app/oauth/authorize';
export const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token';
export const LINEAR_REVOKE_URL = 'https://api.linear.app/oauth/revoke';

/** Comma-separated scopes: read issues + write status/attachments back later. */
export const LINEAR_OAUTH_SCOPES = 'read,write';

/** Fixed, uncommon loopback port — must match the callback registered in the Linear app. */
export const LINEAR_REDIRECT_PORT = 52847;
export const LINEAR_REDIRECT_PATH = '/callback';

/** How long to wait for the browser round-trip before giving up (mirrors auth.ts). */
export const LINEAR_OAUTH_TIMEOUT_MS = 3 * 60 * 1000;

/** The redirect URI passed to Linear — identical in dev and packaged builds. */
export const linearRedirectUri = (): string =>
  `http://localhost:${LINEAR_REDIRECT_PORT}${LINEAR_REDIRECT_PATH}`;

/** OAuth client credentials, inlined at build time (empty in dev without a .env). */
export const LINEAR_CLIENT_ID: string = process.env.LINEAR_CLIENT_ID ?? '';
export const LINEAR_CLIENT_SECRET: string = process.env.LINEAR_CLIENT_SECRET ?? '';
