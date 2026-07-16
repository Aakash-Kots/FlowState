/**
 * SlackService — talks to Slack via @slack/web-api using the user OAuth token
 * captured on the Connect screen (encrypted with Electron safeStorage). Powers the
 * Slack tab: list the conversations you can see, read a chosen channel's recent
 * history, post messages/replies as you, and surface messages that @-mention you
 * (via search). Display names/avatars are resolved and cached per user. The auth
 * flow itself lives in `slack-oauth.ts` / `AuthService`.
 */
import { WebClient } from '@slack/web-api';
import { SlackChannelKind } from '@flowstate/shared';
import type {
  ListSlackMessagesInput,
  SendSlackMessageInput,
  SlackChannel,
  SlackMention,
  SlackMessage,
  SlackUser,
} from '@flowstate/shared';
import { SecretName } from '../lib/enums/secret';
import { getSecret } from '../store/secrets';

///////////////
// Constants //
///////////////

/** Conversation types requested from `conversations.list`. */
const CONVERSATION_TYPES = 'public_channel,private_channel,mpim,im';

/** Default number of messages read per channel history request. */
const DEFAULT_MESSAGE_LIMIT = 50;

/** Number of mention matches fetched per refresh. */
const MENTION_COUNT = 30;

/////////////
// Helpers //
/////////////

/** The raw shape of a `conversations.list` entry we read. */
type RawConversation = {
  id?: string;
  name?: string;
  user?: string;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
  is_member?: boolean;
};

/** The raw shape of a `conversations.history` message we read. */
type RawMessage = {
  ts?: string;
  user?: string;
  bot_id?: string;
  username?: string;
  text?: string;
  thread_ts?: string;
};

/** The raw shape of a `users.info` profile we read. */
type RawUser = {
  id?: string;
  name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
    image_72?: string;
  };
};

/** The raw shape of a `search.messages` match we read. */
type RawMatch = {
  ts?: string;
  text?: string;
  user?: string;
  username?: string;
  permalink?: string;
  channel?: { id?: string; name?: string };
};

/** Classify a raw conversation into our channel-kind mirror enum. */
function toChannelKind(c: RawConversation): SlackChannelKind {
  if (c.is_im) return SlackChannelKind.Im;
  if (c.is_mpim) return SlackChannelKind.Mpim;
  if (c.is_private) return SlackChannelKind.Private;
  return SlackChannelKind.Public;
}

export class SlackService {
  /** Per-user display info, cached for the process lifetime (names rarely change). */
  private readonly userCache = new Map<string, SlackUser>();
  /** The linked account's own identity, resolved once via `auth.test`. */
  private me: { id: string; handle: string } | null = null;

  /** The linked account's user OAuth token, or throw a Connect-first error. */
  private token(): string {
    const token = getSecret(SecretName.SlackToken);
    if (!token) {
      throw new Error('No linked Slack account. Connect Slack from the Connect screen first.');
    }
    return token;
  }

  /** A fresh SDK client bound to the linked account's token. */
  private client(): WebClient {
    return new WebClient(this.token());
  }

  /** The linked account's own id + handle (for building the mentions search). */
  private async identity(): Promise<{ id: string; handle: string }> {
    if (this.me) return this.me;
    const res = (await this.client().auth.test()) as { user_id?: string; user?: string };
    this.me = { id: res.user_id ?? '', handle: res.user ?? '' };
    return this.me;
  }

  /** Resolve a user's display name + avatar, cached. Falls back to the id. */
  private async resolveUser(userId: string): Promise<SlackUser> {
    if (!userId) return { id: '', name: 'unknown', displayName: 'unknown' };
    const cached = this.userCache.get(userId);
    if (cached) return cached;
    let user: SlackUser = { id: userId, name: userId, displayName: userId };
    try {
      const res = (await this.client().users.info({ user: userId })) as { user?: RawUser };
      const u = res.user;
      if (u) {
        const displayName = u.profile?.display_name || u.profile?.real_name || u.name || userId;
        user = {
          id: userId,
          name: u.name ?? userId,
          displayName,
          avatarUrl: u.profile?.image_72,
        };
      }
    } catch {
      // Non-fatal — fall back to the id as the name.
    }
    this.userCache.set(userId, user);
    return user;
  }

  /** Conversations the linked user can see (channels, DMs, group DMs). */
  async channels(): Promise<SlackChannel[]> {
    const res = (await this.client().conversations.list({
      types: CONVERSATION_TYPES,
      exclude_archived: true,
      limit: 1000,
    })) as { channels?: RawConversation[] };
    const out: SlackChannel[] = [];
    for (const c of res.channels ?? []) {
      if (!c.id) continue;
      const kind = toChannelKind(c);
      // DMs have no `name` — label them with the other member's display name.
      const name =
        c.name ?? (kind === SlackChannelKind.Im && c.user ? (await this.resolveUser(c.user)).displayName : c.id);
      out.push({
        id: c.id,
        name,
        kind,
        isMember: kind === SlackChannelKind.Im || kind === SlackChannelKind.Mpim ? true : c.is_member ?? false,
      });
    }
    return out;
  }

  /** A channel's recent messages, oldest→newest, with resolved author info. */
  async messages(input: ListSlackMessagesInput): Promise<SlackMessage[]> {
    const res = (await this.client().conversations.history({
      channel: input.channelId,
      limit: input.limit ?? DEFAULT_MESSAGE_LIMIT,
    })) as { messages?: RawMessage[] };
    // Slack returns newest-first; the UI reads a chat log top-to-bottom.
    const raw = [...(res.messages ?? [])].reverse();
    const out: SlackMessage[] = [];
    for (const m of raw) {
      if (!m.ts) continue;
      const userId = m.user ?? m.bot_id ?? '';
      const author = m.user
        ? await this.resolveUser(m.user)
        : { id: userId, name: m.username ?? 'bot', displayName: m.username ?? 'bot', avatarUrl: undefined };
      out.push({
        ts: m.ts,
        channelId: input.channelId,
        userId,
        userName: author.displayName,
        userAvatarUrl: author.avatarUrl,
        text: m.text ?? '',
        threadTs: m.thread_ts,
      });
    }
    return out;
  }

  /** Post a message (or a thread reply when `threadTs` is set) as the linked user. */
  async sendMessage(input: SendSlackMessageInput): Promise<void> {
    const res = (await this.client().chat.postMessage({
      channel: input.channelId,
      text: input.text,
      thread_ts: input.threadTs,
    })) as { ok?: boolean; error?: string };
    if (!res.ok) throw new Error(`Slack rejected the message: ${res.error ?? 'unknown'}`);
  }

  /** Recent messages that @-mention the linked user, newest first (via search). */
  async mentions(): Promise<SlackMention[]> {
    const { handle } = await this.identity();
    if (!handle) return [];
    const res = (await this.client().search.messages({
      query: `@${handle}`,
      count: MENTION_COUNT,
      sort: 'timestamp',
      sort_dir: 'desc',
    })) as { messages?: { matches?: RawMatch[] } };
    const out: SlackMention[] = [];
    for (const m of res.messages?.matches ?? []) {
      if (!m.ts || !m.channel?.id) continue;
      const userId = m.user ?? '';
      const author = userId ? await this.resolveUser(userId) : null;
      out.push({
        ts: m.ts,
        channelId: m.channel.id,
        channelName: m.channel.name ?? m.channel.id,
        userId,
        userName: author?.displayName ?? m.username ?? 'unknown',
        text: m.text ?? '',
        permalink: m.permalink ?? '',
      });
    }
    return out;
  }
}

/** Shared singleton — mirrors `linearService`. */
export const slackService = new SlackService();
