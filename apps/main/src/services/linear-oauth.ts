/**
 * Linear OAuth loopback flow (pure mechanics — no persistence, no status).
 *
 * Linear only accepts pre-registered http(s) redirect URIs and does not support
 * PKCE, so we bind a one-shot loopback HTTP server on a fixed localhost port,
 * open the system browser to Linear's authorize URL, catch the `?code=` redirect,
 * verify the `state` (CSRF), and exchange the code for a long-lived access token
 * using the confidential client secret. The server and timers are always torn
 * down; the flow is abortable via an AbortSignal (user cancel).
 *
 * The token exchange is isolated in `exchangeCode` so it can later be pointed at
 * a hosted proxy (which would hold the client secret) without touching callers.
 */
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { shell } from 'electron';
import {
  LINEAR_AUTHORIZE_URL,
  LINEAR_CLIENT_ID,
  LINEAR_CLIENT_SECRET,
  LINEAR_OAUTH_SCOPES,
  LINEAR_OAUTH_TIMEOUT_MS,
  LINEAR_REDIRECT_PATH,
  LINEAR_REDIRECT_PORT,
  LINEAR_TOKEN_URL,
  linearRedirectUri,
} from '../lib/constants/linear';

///////////
// Types //
///////////

export type LinearOAuthResult = { accessToken: string; scope: string };

/////////////
// Helpers //
/////////////

/** A tiny HTML page shown in the browser tab after the redirect lands. */
function closePage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>FlowState</title></head><body style="font-family:system-ui;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="font-weight:600">${message}</h2><p style="color:#888">You can close this tab and return to FlowState.</p></div></body></html>`;
}

/** Swap an authorization code for an access token (POST, form-encoded). */
async function exchangeCode(code: string): Promise<LinearOAuthResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: linearRedirectUri(),
    client_id: LINEAR_CLIENT_ID,
    client_secret: LINEAR_CLIENT_SECRET,
  });
  const res = await fetch(LINEAR_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Linear token exchange failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string; scope?: string };
  if (!json.access_token) throw new Error('Linear token exchange returned no access_token.');
  return { accessToken: json.access_token, scope: json.scope ?? LINEAR_OAUTH_SCOPES };
}

/** Build the authorize URL the browser is sent to. */
function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: LINEAR_CLIENT_ID,
    redirect_uri: linearRedirectUri(),
    response_type: 'code',
    scope: LINEAR_OAUTH_SCOPES,
    state,
    actor: 'user',
  });
  return `${LINEAR_AUTHORIZE_URL}?${params.toString()}`;
}

////////////
// Export //
////////////

/**
 * Run the full loopback OAuth dance and resolve with the access token. Rejects on
 * error, `state` mismatch, timeout, or abort; the server and timer are always
 * cleaned up.
 */
export async function runLinearOAuth(opts?: { signal?: AbortSignal }): Promise<LinearOAuthResult> {
  if (!LINEAR_CLIENT_ID || !LINEAR_CLIENT_SECRET) {
    throw new Error('Linear OAuth is not configured (missing LINEAR_CLIENT_ID/SECRET).');
  }
  const signal = opts?.signal;
  const state = randomBytes(32).toString('hex');

  return new Promise<LinearOAuthResult>((resolve, reject) => {
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
    const succeed = (result: LinearOAuthResult): void => {
      cleanup();
      resolve(result);
    };
    const onAbort = (): void => fail(new Error('Linear login cancelled.'));

    if (signal) {
      if (signal.aborted) return reject(new Error('Linear login cancelled.'));
      signal.addEventListener('abort', onAbort, { once: true });
    }

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', linearRedirectUri());
      if (url.pathname !== LINEAR_REDIRECT_PATH) {
        res.writeHead(404).end();
        return;
      }
      const respond = (message: string): void => {
        res.writeHead(200, { 'Content-Type': 'text/html', Connection: 'close' });
        res.end(closePage(message));
      };
      const error = url.searchParams.get('error');
      if (error) {
        respond('Linear authorization was denied.');
        fail(new Error(`Linear authorization error: ${error}`));
        return;
      }
      if (url.searchParams.get('state') !== state) {
        respond('Linear authorization failed.');
        fail(new Error('Linear OAuth state mismatch.'));
        return;
      }
      const code = url.searchParams.get('code');
      if (!code) {
        respond('Linear authorization failed.');
        fail(new Error('Linear OAuth callback missing code.'));
        return;
      }
      respond('Linear connected.');
      exchangeCode(code).then(succeed, fail);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      fail(
        err.code === 'EADDRINUSE'
          ? new Error(`Port ${LINEAR_REDIRECT_PORT} is in use — close the other instance and retry.`)
          : err,
      );
    });

    server.listen(LINEAR_REDIRECT_PORT, '127.0.0.1', () => {
      timer = setTimeout(() => fail(new Error('Linear login timed out.')), LINEAR_OAUTH_TIMEOUT_MS);
      void shell.openExternal(authorizeUrl(state));
    });
  });
}
