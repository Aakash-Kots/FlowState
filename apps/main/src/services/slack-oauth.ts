/**
 * Slack OAuth v2 loopback flow (pure mechanics — no persistence, no status).
 *
 * Slack only accepts pre-registered http(s) redirect URIs, so we bind a one-shot
 * loopback HTTP server on a fixed localhost port, open the system browser to
 * Slack's authorize URL, catch the `?code=` redirect, verify the `state` (CSRF),
 * and exchange the code for a long-lived *user* access token using the
 * confidential client secret. The server and timers are always torn down; the
 * flow is abortable via an AbortSignal (user cancel).
 *
 * Slack difference vs Linear: we request `user_scope`, and the user token comes
 * back nested under `authed_user.access_token` (not the top-level `access_token`,
 * which would be the bot token we don't use).
 */
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { shell } from 'electron';
import {
  SLACK_AUTHORIZE_URL,
  SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET,
  SLACK_OAUTH_TIMEOUT_MS,
  SLACK_REDIRECT_PATH,
  SLACK_REDIRECT_PORT,
  SLACK_TOKEN_URL,
  SLACK_USER_SCOPES,
  slackRedirectUri,
} from '../lib/constants/slack';

///////////
// Types //
///////////

export type SlackOAuthResult = {
  accessToken: string;
  teamId: string;
  userId: string;
  scope: string;
};

/////////////
// Helpers //
/////////////

/** A tiny HTML page shown in the browser tab after the redirect lands. */
function closePage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>FlowState</title></head><body style="font-family:system-ui;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="font-weight:600">${message}</h2><p style="color:#888">You can close this tab and return to FlowState.</p></div></body></html>`;
}

/** The relevant subset of Slack's `oauth.v2.access` response. */
type TokenResponse = {
  ok: boolean;
  error?: string;
  team?: { id?: string };
  authed_user?: { id?: string; access_token?: string; scope?: string };
};

/** Swap an authorization code for a user access token (POST, form-encoded). */
async function exchangeCode(code: string): Promise<SlackOAuthResult> {
  const body = new URLSearchParams({
    code,
    redirect_uri: slackRedirectUri(),
    client_id: SLACK_CLIENT_ID,
    client_secret: SLACK_CLIENT_SECRET,
  });
  const res = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Slack token exchange failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as TokenResponse;
  // Slack always returns HTTP 200; the real status is the `ok` flag.
  if (!json.ok) throw new Error(`Slack token exchange error: ${json.error ?? 'unknown'}`);
  const token = json.authed_user?.access_token;
  if (!token) throw new Error('Slack token exchange returned no user access_token.');
  return {
    accessToken: token,
    teamId: json.team?.id ?? '',
    userId: json.authed_user?.id ?? '',
    scope: json.authed_user?.scope ?? SLACK_USER_SCOPES,
  };
}

/** Build the authorize URL the browser is sent to. */
function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    user_scope: SLACK_USER_SCOPES,
    redirect_uri: slackRedirectUri(),
    state,
  });
  return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
}

////////////
// Export //
////////////

/**
 * Run the full loopback OAuth dance and resolve with the user access token.
 * Rejects on error, `state` mismatch, timeout, or abort; the server and timer are
 * always cleaned up.
 */
export async function runSlackOAuth(opts?: { signal?: AbortSignal }): Promise<SlackOAuthResult> {
  if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
    throw new Error('Slack OAuth is not configured (missing SLACK_CLIENT_ID/SECRET).');
  }
  const signal = opts?.signal;
  const state = randomBytes(32).toString('hex');

  return new Promise<SlackOAuthResult>((resolve, reject) => {
    let server: Server | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      server?.close();
      server = null;
    };
    const fail = (err: Error): void => {
      cleanup();
      reject(err);
    };
    const succeed = (result: SlackOAuthResult): void => {
      cleanup();
      resolve(result);
    };
    const onAbort = (): void => fail(new Error('Slack login cancelled.'));

    if (signal) {
      if (signal.aborted) return reject(new Error('Slack login cancelled.'));
      signal.addEventListener('abort', onAbort, { once: true });
    }

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', slackRedirectUri());
      if (url.pathname !== SLACK_REDIRECT_PATH) {
        res.writeHead(404).end();
        return;
      }
      const respond = (message: string): void => {
        res.writeHead(200, { 'Content-Type': 'text/html', Connection: 'close' });
        res.end(closePage(message));
      };
      const error = url.searchParams.get('error');
      if (error) {
        respond('Slack authorization was denied.');
        fail(new Error(`Slack authorization error: ${error}`));
        return;
      }
      if (url.searchParams.get('state') !== state) {
        respond('Slack authorization failed.');
        fail(new Error('Slack OAuth state mismatch.'));
        return;
      }
      const code = url.searchParams.get('code');
      if (!code) {
        respond('Slack authorization failed.');
        fail(new Error('Slack OAuth callback missing code.'));
        return;
      }
      respond('Slack connected.');
      exchangeCode(code).then(succeed, fail);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      fail(
        err.code === 'EADDRINUSE'
          ? new Error(`Port ${SLACK_REDIRECT_PORT} is in use — close the other instance and retry.`)
          : err,
      );
    });

    server.listen(SLACK_REDIRECT_PORT, '127.0.0.1', () => {
      timer = setTimeout(() => fail(new Error('Slack login timed out.')), SLACK_OAUTH_TIMEOUT_MS);
      void shell.openExternal(authorizeUrl(state));
    });
  });
}
