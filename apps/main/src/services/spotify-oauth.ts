/**
 * Spotify OAuth loopback flow with PKCE (pure mechanics — no persistence, no
 * status).
 *
 * Spotify accepts pre-registered loopback redirect URIs and supports PKCE, so we
 * avoid shipping a client secret: a one-shot loopback HTTP server binds a fixed
 * localhost port, we open the system browser to Spotify's authorize URL with a
 * `code_challenge`, catch the `?code=` redirect, verify the `state` (CSRF), and
 * exchange the code for tokens by presenting the `code_verifier`. The server and
 * timers are always torn down; the flow is abortable via an AbortSignal (user
 * cancel).
 *
 * The token exchange is isolated in `exchangeCode` so it can later be pointed at
 * a hosted proxy without touching callers.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { shell } from 'electron';
import {
  SPOTIFY_AUTHORIZE_URL,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_OAUTH_SCOPES,
  SPOTIFY_OAUTH_TIMEOUT_MS,
  SPOTIFY_REDIRECT_PATH,
  SPOTIFY_REDIRECT_PORT,
  SPOTIFY_TOKEN_URL,
  spotifyRedirectUri,
} from '../lib/constants/spotify';

///////////
// Types //
///////////

export type SpotifyOAuthResult = {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires (Spotify returns ~3600). */
  expiresIn: number;
  scope: string;
};

/////////////
// Helpers //
/////////////

/** A tiny HTML page shown in the browser tab after the redirect lands. */
function closePage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>FlowState</title></head><body style="font-family:system-ui;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="font-weight:600">${message}</h2><p style="color:#888">You can close this tab and return to FlowState.</p></div></body></html>`;
}

/** base64url encoding (no padding) — used for the PKCE challenge. */
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Swap an authorization code for tokens (POST, form-encoded, with PKCE verifier). */
async function exchangeCode(code: string, codeVerifier: string): Promise<SpotifyOAuthResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: spotifyRedirectUri(),
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: codeVerifier,
  });
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Spotify token exchange failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token || !json.refresh_token) {
    throw new Error('Spotify token exchange returned no access/refresh token.');
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in ?? 3600,
    scope: json.scope ?? SPOTIFY_OAUTH_SCOPES,
  };
}

/** Build the authorize URL the browser is sent to. */
function authorizeUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: spotifyRedirectUri(),
    scope: SPOTIFY_OAUTH_SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });
  return `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`;
}

////////////
// Export //
////////////

/**
 * Run the full loopback PKCE OAuth dance and resolve with the tokens. Rejects on
 * error, `state` mismatch, timeout, or abort; the server and timer are always
 * cleaned up.
 */
export async function runSpotifyOAuth(opts?: {
  signal?: AbortSignal;
}): Promise<SpotifyOAuthResult> {
  if (!SPOTIFY_CLIENT_ID) {
    throw new Error('Spotify OAuth is not configured (missing SPOTIFY_CLIENT_ID).');
  }
  const signal = opts?.signal;
  const state = randomBytes(32).toString('hex');
  const codeVerifier = base64url(randomBytes(64));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

  return new Promise<SpotifyOAuthResult>((resolve, reject) => {
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
    const succeed = (result: SpotifyOAuthResult): void => {
      cleanup();
      resolve(result);
    };
    const onAbort = (): void => fail(new Error('Spotify login cancelled.'));

    if (signal) {
      if (signal.aborted) return reject(new Error('Spotify login cancelled.'));
      signal.addEventListener('abort', onAbort, { once: true });
    }

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', spotifyRedirectUri());
      if (url.pathname !== SPOTIFY_REDIRECT_PATH) {
        res.writeHead(404).end();
        return;
      }
      const respond = (message: string): void => {
        res.writeHead(200, { 'Content-Type': 'text/html', Connection: 'close' });
        res.end(closePage(message));
      };
      const error = url.searchParams.get('error');
      if (error) {
        respond('Spotify authorization was denied.');
        fail(new Error(`Spotify authorization error: ${error}`));
        return;
      }
      if (url.searchParams.get('state') !== state) {
        respond('Spotify authorization failed.');
        fail(new Error('Spotify OAuth state mismatch.'));
        return;
      }
      const code = url.searchParams.get('code');
      if (!code) {
        respond('Spotify authorization failed.');
        fail(new Error('Spotify OAuth callback missing code.'));
        return;
      }
      respond('Spotify connected.');
      exchangeCode(code, codeVerifier).then(succeed, fail);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      fail(
        err.code === 'EADDRINUSE'
          ? new Error(`Port ${SPOTIFY_REDIRECT_PORT} is in use — close the other instance and retry.`)
          : err,
      );
    });

    server.listen(SPOTIFY_REDIRECT_PORT, '127.0.0.1', () => {
      timer = setTimeout(() => fail(new Error('Spotify login timed out.')), SPOTIFY_OAUTH_TIMEOUT_MS);
      void shell.openExternal(authorizeUrl(state, codeChallenge));
    });
  });
}
