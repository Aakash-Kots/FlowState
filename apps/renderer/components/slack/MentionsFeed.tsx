'use client';

import { useEffect, useRef } from 'react';
import { AtSign } from 'lucide-react';
import { type SlackMention } from '@flowstate/shared';
import { isNewer, markMentionsSeen, setActiveChannel, useSlack } from '@/lib/slack';
import { trpc } from '@/lib/trpc';
import { cn } from '../ui/cn';
import { prettySlackText, relativeTime } from './atoms';

/** One mention row: channel, author, snippet, relative time, unread accent. */
function MentionRow({ mention, unread }: { mention: SlackMention; unread: boolean }) {
  const isFollowed = useSlack((s) => s.selectedChannelIds.includes(mention.channelId));

  // Followed channel → jump to it in the pane; otherwise open it in Slack.
  const onClick = () => {
    if (isFollowed) setActiveChannel(mention.channelId);
    else if (mention.permalink) {
      void trpc().app.openExternal.mutate({ url: mention.permalink });
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-2 rounded border-l-2 px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted',
        unread ? 'border-primary' : 'border-transparent',
      )}
    >
      <span className="mt-0.5 shrink-0 font-medium text-muted-foreground">
        #{mention.channelName}
      </span>
      <span className="min-w-0 flex-1 truncate text-neutral-200">
        <span className="text-muted-foreground">{mention.userName}: </span>
        {prettySlackText(mention.text)}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(mention.ts)}</span>
    </button>
  );
}

/**
 * The @-mentions feed at the top of the Slack tab. Highlights mentions newer than
 * the seen baseline (snapshotted on open so they stay visible), then marks them
 * seen so the header badge clears once you're looking here.
 */
export function MentionsFeed() {
  const mentions = useSlack((s) => s.mentions);
  const seenTs = useSlack((s) => s.mentionsSeenTs);

  // Snapshot the baseline on first render so the highlight survives the mark-seen
  // that fires right after — you still see which mentions were new this visit.
  const baseline = useRef(seenTs);

  useEffect(() => {
    if (mentions.length) void markMentionsSeen();
  }, [mentions]);

  if (mentions.length === 0) return null;

  return (
    <div className="border-b border-border bg-secondary/40 px-2 py-2">
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <AtSign className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Mentions
        </span>
      </div>
      <div className="flex max-h-40 flex-col overflow-y-auto">
        {mentions.map((m) => (
          <MentionRow key={`${m.channelId}-${m.ts}`} mention={m} unread={isNewer(m.ts, baseline.current)} />
        ))}
      </div>
    </div>
  );
}
