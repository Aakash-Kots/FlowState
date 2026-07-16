/**
 * Slack OAuth constants (main-process only). Slack implements OAuth v2 as a
 * confidential-client Authorization Code flow: a `client_secret` is required and
 * redirect URIs must be pre-registered and exact-match — hence a fixed loopback
 * port. We request only *user* token scopes (`user_scope`), so FlowState acts as
 * you: reads your DMs/mentions and posts as you. User tokens are long-lived with
 * no refresh token, so logout is a local delete. The client id/secret are injected
 * at build time via electron-vite `define` (see electron.vite.config).
 */

export const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
export const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

/**
 * User-token scopes: find mentions (search), list channels/DMs, read their
 * history, post messages, and resolve display names for avatars. These go in the
 * `user_scope` param — distinct from bot `scope`, which we leave empty.
 */
export const SLACK_USER_SCOPES = [
  'search:read',
  'channels:read',
  'groups:read',
  'im:read',
  'mpim:read',
  'channels:history',
  'groups:history',
  'im:history',
  'mpim:history',
  'chat:write',
  'users:read',
].join(',');

/** Fixed loopback port — must match the redirect URL registered in the Slack app. */
export const SLACK_REDIRECT_PORT = 52848;
export const SLACK_REDIRECT_PATH = '/callback';

/** How long to wait for the browser round-trip before giving up (mirrors auth.ts). */
export const SLACK_OAUTH_TIMEOUT_MS = 3 * 60 * 1000;

/** The redirect URI passed to Slack — identical in dev and packaged builds. */
export const slackRedirectUri = (): string =>
  `http://localhost:${SLACK_REDIRECT_PORT}${SLACK_REDIRECT_PATH}`;

/** OAuth client credentials, inlined at build time (empty in dev without a .env). */
export const SLACK_CLIENT_ID: string = process.env.SLACK_CLIENT_ID ?? '';
export const SLACK_CLIENT_SECRET: string = process.env.SLACK_CLIENT_SECRET ?? '';
