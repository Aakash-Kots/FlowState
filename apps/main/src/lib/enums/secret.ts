/**
 * Well-known secret names FlowState persists (main-process only — secrets live
 * behind the OS keychain via Electron `safeStorage`). Values are the keys under
 * which ciphertext is stored in SQLite.
 */

/** Well-known secret names FlowState persists. */
export enum SecretName {
  LinearToken = 'linear.token',
  GithubToken = 'github.token',
  AnthropicApiKey = 'anthropic.apiKey',
  /** Google Gemini API key (user-supplied) powering "Ask Gemini", ticket
   * refinement, and speech-to-text. */
  GeminiApiKey = 'gemini.apiKey',
  /** A copy of the Claude Code OAuth credential captured after `claude auth login`. */
  ClaudeCredentials = 'claude.credentials',
  /** Spotify OAuth access token (expires ~1h — refreshed via the refresh token). */
  SpotifyAccessToken = 'spotify.accessToken',
  /** Spotify OAuth refresh token (long-lived — used to mint new access tokens). */
  SpotifyRefreshToken = 'spotify.refreshToken',
}
