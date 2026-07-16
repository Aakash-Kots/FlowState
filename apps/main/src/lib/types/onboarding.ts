/**
 * Onboarding domain types (main process). The persisted connection state the
 * AuthService reports and the onboarding router forwards to the renderer.
 */

/** Which third-party providers the user has connected during onboarding. */
export type OnboardingStatus = {
  claudeConnected: boolean;
  githubConnected: boolean;
  /** Linear is optional — connecting it never gates the first-run flow. */
  linearConnected: boolean;
  /** Spotify is optional — connecting it never gates the first-run flow. */
  spotifyConnected: boolean;
};
