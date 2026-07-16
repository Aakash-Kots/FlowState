/**
 * Enumerations for the Slack domain, shared between the main process and the
 * renderer. Values are the wire strings, so they serialize over IPC unchanged.
 */

/**
 * The kind of Slack conversation. A mirror enum over Slack's conversation flags
 * (`is_im` / `is_mpim` / `is_private`) — re-declared so we can group and label
 * channels without branching on raw booleans. `Public` is the fallback for a
 * plain channel the user is a member of.
 */
export enum SlackChannelKind {
  Public = 'public',
  Private = 'private',
  Im = 'im',
  Mpim = 'mpim',
}
