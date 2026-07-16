/**
 * Runtime validation for the Slack domain. Mirrors `../types/slack`.
 */
import { z } from 'zod';
import { SlackChannelKind } from '../enums/slack';
import type {
  ListSlackMessagesInput,
  MarkSlackMentionsSeenInput,
  SendSlackMessageInput,
  SetSlackChannelsInput,
  SlackChannel,
  SlackMention,
  SlackMessage,
  SlackUser,
} from '../types/slack';

export const slackChannelSchema: z.ZodType<SlackChannel> = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.nativeEnum(SlackChannelKind),
  isMember: z.boolean(),
});

export const slackUserSchema: z.ZodType<SlackUser> = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
});

export const slackMessageSchema: z.ZodType<SlackMessage> = z.object({
  ts: z.string(),
  channelId: z.string(),
  userId: z.string(),
  userName: z.string(),
  userAvatarUrl: z.string().optional(),
  text: z.string(),
  threadTs: z.string().optional(),
});

export const slackMentionSchema: z.ZodType<SlackMention> = z.object({
  ts: z.string(),
  channelId: z.string(),
  channelName: z.string(),
  userId: z.string(),
  userName: z.string(),
  text: z.string(),
  permalink: z.string(),
});

export const listSlackMessagesInputSchema: z.ZodType<ListSlackMessagesInput> = z.object({
  channelId: z.string(),
  limit: z.number().optional(),
});

export const sendSlackMessageInputSchema: z.ZodType<SendSlackMessageInput> = z.object({
  channelId: z.string(),
  text: z.string().min(1),
  threadTs: z.string().optional(),
});

export const setSlackChannelsInputSchema: z.ZodType<SetSlackChannelsInput> = z.object({
  channelIds: z.array(z.string()),
});

export const markSlackMentionsSeenInputSchema: z.ZodType<MarkSlackMentionsSeenInput> = z.object({
  ts: z.string(),
});
