/**
 * Connection/status states for the onboarding + session status pills (renderer).
 */

/** Visual connection state rendered by `StatusPill`. */
export enum ConnStatus {
  Connected = 'connected',
  Pending = 'pending',
  Error = 'error',
  Idle = 'idle',
}
