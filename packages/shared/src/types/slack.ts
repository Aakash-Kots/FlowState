/**
 * Slack integration types. Validation lives in `../schemas/slack`.
 */
import type { SlackChannelKind } from '../enums/slack';

/**
 * A Slack conversation the linked user can see — a public/private channel, a DM,
 * or a group DM. Kept small: just enough to list channels and let the user pick a
 * few to follow.
 */
export type SlackChannel = {
  id: string;
  /** Human name — the channel name, or the other member's name for a DM. */
  name: string;
  kind: SlackChannelKind;
  /** Whether the linked user is a member (channels/mpims); always true for DMs. */
  isMember: boolean;
};

/** A Slack user — resolved to put a name/avatar on a message. */
export type SlackUser = {
  id: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
};

/**
 * A single message in a channel's history. `ts` is Slack's message id
 * ("1700000000.000100"), unique within a channel and also its sort key.
 */
export type SlackMessage = {
  ts: string;
  channelId: string;
  userId: string;
  userName: string;
  userAvatarUrl?: string;
  text: string;
  /** The thread parent's ts when this message is a reply, else undefined. */
  threadTs?: string;
};

/**
 * A message that @-mentions the linked user, surfaced in the mentions feed. Read
 * state is tracked client-side against the last-seen ts (Slack search has no
 * unread flag), so this carries no `unread` field.
 */
export type SlackMention = {
  ts: string;
  channelId: string;
  channelName: string;
  userId: string;
  userName: string;
  text: string;
  /** Deep link back into the Slack client. */
  permalink: string;
};

/** Input to read a channel's recent messages. */
export type ListSlackMessagesInput = {
  channelId: string;
  limit?: number;
};

/** Input to post a message (or a thread reply when `threadTs` is set). */
export type SendSlackMessageInput = {
  channelId: string;
  text: string;
  threadTs?: string;
};

/** Input to persist the user's followed-channel selection. */
export type SetSlackChannelsInput = {
  channelIds: string[];
};

/** Input to mark mentions read up to (and including) a given ts. */
export type MarkSlackMentionsSeenInput = {
  ts: string;
};
