/**
 * Slack control plane — a thin door over `slackService` plus the local
 * followed-channel selection and mentions-seen marker (persisted in the settings
 * KV store). Powers the Slack tab: list conversations, read/post messages, and
 * pull the messages that @-mention the linked user. Auth lives on the onboarding
 * router / AuthService.
 */
import {
  type SlackChannel,
  type SlackMention,
  type SlackMessage,
  listSlackMessagesInputSchema,
  markSlackMentionsSeenInputSchema,
  sendSlackMessageInputSchema,
  setSlackChannelsInputSchema,
  slackChannelSchema,
  slackMentionSchema,
  slackMessageSchema,
} from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { slackService } from '../services/slack';
import {
  getSlackChannels,
  getSlackMentionsSeenTs,
  setSlackChannels,
  setSlackMentionsSeenTs,
} from '../store/settings';
import { publicProcedure, router } from '../trpc';

const channelsSchema = z.array(slackChannelSchema);
const messagesSchema = z.array(slackMessageSchema);
const mentionsSchema = z.array(slackMentionSchema);

/** Wrap a Slack call, surfacing its message as an INTERNAL_SERVER_ERROR. */
async function guard<T>(fn: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: err instanceof Error ? err.message : fallback,
    });
  }
}

export const slackRouter = router({
  /** Conversations the linked user can see — the channel picker's options. */
  channels: publicProcedure.query((): Promise<SlackChannel[]> =>
    guard(async () => channelsSchema.parse(await slackService.channels()), 'Failed to load Slack channels.'),
  ),

  /** A channel's recent messages, oldest→newest. */
  messages: publicProcedure
    .input(listSlackMessagesInputSchema)
    .query(({ input }): Promise<SlackMessage[]> =>
      guard(async () => messagesSchema.parse(await slackService.messages(input)), 'Failed to load Slack messages.'),
    ),

  /** Recent messages that @-mention the linked user, newest first. */
  mentions: publicProcedure.query((): Promise<SlackMention[]> =>
    guard(async () => mentionsSchema.parse(await slackService.mentions()), 'Failed to load Slack mentions.'),
  ),

  /** Post a message (or a thread reply) as the linked user. */
  sendMessage: publicProcedure
    .input(sendSlackMessageInputSchema)
    .mutation(({ input }): Promise<void> =>
      guard(() => slackService.sendMessage(input), 'Failed to send the message.'),
    ),

  /** The channel ids the user follows in the Slack tab. */
  selectedChannels: publicProcedure.query((): string[] => getSlackChannels()),

  /** Persist the user's followed-channel selection. */
  setSelectedChannels: publicProcedure
    .input(setSlackChannelsInputSchema)
    .mutation(({ input }): void => setSlackChannels(input.channelIds)),

  /** The ts of the newest mention the user has marked seen (unread baseline). */
  mentionsSeenTs: publicProcedure.query((): string => getSlackMentionsSeenTs()),

  /** Mark mentions read up to (and including) the given ts. */
  markMentionsSeen: publicProcedure
    .input(markSlackMentionsSeenInputSchema)
    .mutation(({ input }): void => setSlackMentionsSeenTs(input.ts)),
});
