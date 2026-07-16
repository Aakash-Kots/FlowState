/**
 * Enumerations for the Spotify domain, shared between the main process and the
 * renderer. Values are the wire strings, so they serialize over IPC unchanged.
 */

/**
 * Spotify's fixed repeat mode — the `repeat_state` field the Web API returns on
 * the player. Re-declared as a mirror enum (values byte-identical to Spotify's)
 * so the UI can dispatch on it without branching on raw strings.
 */
export enum SpotifyRepeatState {
  Off = 'off',
  Track = 'track',
  Context = 'context',
}
