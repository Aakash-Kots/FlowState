'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useOnboarding } from '@/lib/onboarding';
import {
  refreshChannels,
  refreshMentions,
  refreshMessages,
  useSlack,
  useSlackSync,
} from '@/lib/slack';
import { cn } from '../ui/cn';
import { useSidebar } from '../ui/sidebar';
import { ChannelList } from './ChannelList';
import { ChannelPicker } from './ChannelPicker';
import { MentionsFeed } from './MentionsFeed';
import { MessagePane } from './MessagePane';

/**
 * The Slack command center: a header (refresh) over the @-mentions feed, then the
 * followed-channel list (left) ⇄ the active channel's messages + composer (right).
 * Live sync is owned by `useSlackSync`, mounted here; the sections read the store.
 * Gated on Slack being connected.
 */
export function SlackView() {
  useSlackSync();

  // Collapse the left sidebar to give the command center room (mount-only, so a
  // user re-opening it while on this tab isn't fought). Mirrors `LinearView`.
  const { setOpen } = useSidebar();
  useEffect(() => {
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slackConnected = useOnboarding((s) => s.slackConnected);
  const loading = useSlack((s) => s.channelsLoading || s.messagesLoading);
  const error = useSlack((s) => s.error);

  const refresh = () => {
    void refreshChannels();
    void refreshMentions();
    const active = useSlack.getState().activeChannelId;
    if (active) void refreshMessages(active);
  };

  if (!slackConnected) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
        Connect Slack from the Connect screen to read and reply here.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-secondary px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Slack
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={refresh}
            title="Refresh"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-border px-3 py-1.5 text-center text-xs text-danger">{error}</div>
      ) : null}

      <MentionsFeed />

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <ChannelList />
        <MessagePane />
      </div>

      <ChannelPicker />
    </div>
  );
}
