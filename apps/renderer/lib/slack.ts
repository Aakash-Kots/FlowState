'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import {
  DEFAULT_WORKSPACE_ID,
  type SlackChannel,
  type SlackMention,
  type SlackMessage,
} from '@flowstate/shared';
import { useOnboarding } from './onboarding';
import { trpc } from './trpc';
import { useWorkspace } from './workspace';

///////////
// Types //
///////////

type SlackStoreState = {
  //// Conversations — the channel picker's options + name lookups. ////
  channels: SlackChannel[];
  channelsLoaded: boolean;
  channelsLoading: boolean;

  //// The channels the user follows (read + post), persisted in the main store. ////
  selectedChannelIds: string[];
  /** The followed channel currently open in the message pane. */
  activeChannelId: string | null;

  //// Message pane. ////
  messagesByChannel: Record<string, SlackMessage[]>;
  messagesLoading: boolean;
  composerText: string;
  sending: boolean;
  error: string | null;

  //// Mentions feed. ////
  mentions: SlackMention[];
  /** ts of the newest mention marked seen — the unread-count baseline. */
  mentionsSeenTs: string;

  //// Channel picker modal. ////
  pickerOpen: boolean;
};

///////////////
// Constants //
///////////////

const INITIAL: SlackStoreState = {
  channels: [],
  channelsLoaded: false,
  channelsLoading: false,
  selectedChannelIds: [],
  activeChannelId: null,
  messagesByChannel: {},
  messagesLoading: false,
  composerText: '',
  sending: false,
  error: null,
  mentions: [],
  mentionsSeenTs: '',
  pickerOpen: false,
};

/** How often the mentions feed re-polls while the app is focused (ms). */
const MENTIONS_POLL_MS = 60_000;

/////////////
// Helpers //
/////////////

export const useSlack = create<SlackStoreState>(() => INITIAL);

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Slack ts values are "seconds.micros" strings — compare numerically. */
export function isNewer(a: string, b: string): boolean {
  return parseFloat(a) > parseFloat(b || '0');
}

/** The followed channels resolved to full objects (ids not yet loaded are dropped). */
export function selectedChannels(state: SlackStoreState): SlackChannel[] {
  const byId = new Map(state.channels.map((c) => [c.id, c]));
  return state.selectedChannelIds.map((id) => byId.get(id)).filter((c): c is SlackChannel => Boolean(c));
}

/** Number of mentions newer than the seen baseline — the tab's unread badge. */
export function useUnreadMentionCount(): number {
  return useSlack((s) => s.mentions.filter((m) => isNewer(m.ts, s.mentionsSeenTs)).length);
}

/////////////
// Actions //
/////////////

/** Load every conversation the user can see (the picker's options). */
export async function refreshChannels(): Promise<void> {
  useSlack.setState({ channelsLoading: true });
  try {
    const channels = await trpc().slack.channels.query();
    useSlack.setState({ channels, channelsLoaded: true, channelsLoading: false });
  } catch (err) {
    useSlack.setState({ channelsLoading: false, error: message(err) });
  }
}

/** Load the persisted followed-channel selection; open the first one. */
export async function refreshSelectedChannels(): Promise<void> {
  try {
    const selectedChannelIds = await trpc().slack.selectedChannels.query();
    useSlack.setState((s) => ({
      selectedChannelIds,
      activeChannelId: s.activeChannelId ?? selectedChannelIds[0] ?? null,
    }));
    const active = useSlack.getState().activeChannelId;
    if (active) void refreshMessages(active);
  } catch {
    // Non-fatal — the list simply stays empty.
  }
}

/** Follow or unfollow a channel; persist and reconcile the active selection. */
export async function toggleFollowChannel(channelId: string): Promise<void> {
  const { selectedChannelIds } = useSlack.getState();
  const next = selectedChannelIds.includes(channelId)
    ? selectedChannelIds.filter((id) => id !== channelId)
    : [...selectedChannelIds, channelId];
  useSlack.setState((s) => ({
    selectedChannelIds: next,
    activeChannelId: next.includes(s.activeChannelId ?? '') ? s.activeChannelId : next[0] ?? null,
  }));
  try {
    await trpc().slack.setSelectedChannels.mutate({ channelIds: next });
  } catch (err) {
    useSlack.setState({ error: message(err) });
  }
  const active = useSlack.getState().activeChannelId;
  if (active && !useSlack.getState().messagesByChannel[active]) void refreshMessages(active);
}

/** Open a followed channel in the message pane and load its history. */
export function setActiveChannel(channelId: string): void {
  useSlack.setState({ activeChannelId: channelId, composerText: '' });
  void refreshMessages(channelId);
}

/** Fetch a channel's recent messages into the cache. */
export async function refreshMessages(channelId: string): Promise<void> {
  useSlack.setState({ messagesLoading: true });
  try {
    const messages = await trpc().slack.messages.query({ channelId });
    useSlack.setState((s) => ({
      messagesByChannel: { ...s.messagesByChannel, [channelId]: messages },
      messagesLoading: false,
    }));
  } catch (err) {
    useSlack.setState({ messagesLoading: false, error: message(err) });
  }
}

/** Update the composer text for the active channel. */
export function setComposerText(composerText: string): void {
  useSlack.setState({ composerText });
}

/** Send the composer text to the active channel, then refresh its history. */
export async function sendActiveMessage(): Promise<void> {
  const { activeChannelId, composerText } = useSlack.getState();
  const text = composerText.trim();
  if (!activeChannelId || !text) return;
  useSlack.setState({ sending: true, error: null });
  try {
    await trpc().slack.sendMessage.mutate({ channelId: activeChannelId, text });
    useSlack.setState({ sending: false, composerText: '' });
    void refreshMessages(activeChannelId);
  } catch (err) {
    useSlack.setState({ sending: false, error: message(err) });
  }
}

/** Refresh the mentions feed (recent messages that @-mention the user). */
export async function refreshMentions(): Promise<void> {
  try {
    const mentions = await trpc().slack.mentions.query();
    useSlack.setState({ mentions });
  } catch {
    // Non-fatal — the feed simply stays as it was.
  }
}

/** Load the persisted mentions-seen baseline (for the unread badge). */
export async function refreshMentionsSeen(): Promise<void> {
  try {
    const mentionsSeenTs = await trpc().slack.mentionsSeenTs.query();
    useSlack.setState({ mentionsSeenTs });
  } catch {
    // Non-fatal — everything counts as unread until this resolves.
  }
}

/** Mark every current mention as seen (clears the unread badge) and persist. */
export async function markMentionsSeen(): Promise<void> {
  const { mentions, mentionsSeenTs } = useSlack.getState();
  const newest = mentions.reduce((max, m) => (isNewer(m.ts, max) ? m.ts : max), mentionsSeenTs);
  if (!newest || newest === mentionsSeenTs) return;
  useSlack.setState({ mentionsSeenTs: newest });
  try {
    await trpc().slack.markMentionsSeen.mutate({ ts: newest });
  } catch {
    // Non-fatal — it re-marks on the next open.
  }
}

/** Open or close the channel picker modal. */
export function setPickerOpen(pickerOpen: boolean): void {
  useSlack.setState({ pickerOpen });
}

////////////
// Sync   //
////////////

/**
 * Poll just the mentions feed (and its seen baseline) app-wide so the header
 * tab's unread badge stays live even when the Slack view isn't open. Cheap — one
 * search call per interval. Mounted by `ViewModeTabs`, which lives in the header
 * for the whole time a worktree is open.
 */
export function useSlackMentionsBadge(): void {
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const slackConnected = useOnboarding((s) => s.slackConnected);

  useEffect(() => {
    if (workspaceId === DEFAULT_WORKSPACE_ID || !slackConnected) return;
    void refreshMentionsSeen();
    void refreshMentions();
    const timer = setInterval(() => void refreshMentions(), MENTIONS_POLL_MS);
    return () => clearInterval(timer);
  }, [workspaceId, slackConnected]);
}

/**
 * Keep the Slack tab in sync while a worktree is open: load conversations, the
 * followed-channel selection, the seen baseline, and the mentions feed once Slack
 * is connected; re-fetch on window focus and poll the mentions feed on an interval
 * (Slack has no push channel in a local app). No-op on the default (non-worktree)
 * workspace or while Slack is disconnected. Mirrors `useLinearSync`; mounted by the
 * Slack view.
 */
export function useSlackSync(): void {
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const slackConnected = useOnboarding((s) => s.slackConnected);

  useEffect(() => {
    if (workspaceId === DEFAULT_WORKSPACE_ID || !slackConnected) return;
    void refreshChannels();
    void refreshSelectedChannels();
    void refreshMentionsSeen();
    void refreshMentions();
  }, [workspaceId, slackConnected]);

  useEffect(() => {
    if (workspaceId === DEFAULT_WORKSPACE_ID || !slackConnected) return;
    const onFocus = () => {
      void refreshMentions();
      const active = useSlack.getState().activeChannelId;
      if (active) void refreshMessages(active);
    };
    window.addEventListener('focus', onFocus);
    const timer = setInterval(() => void refreshMentions(), MENTIONS_POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [workspaceId, slackConnected]);
}
