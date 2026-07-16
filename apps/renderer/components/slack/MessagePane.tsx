'use client';

import { type SlackMessage } from '@flowstate/shared';
import { selectedChannels, useSlack } from '@/lib/slack';
import { Avatar, ChannelIcon, prettySlackText, relativeTime } from './atoms';
import { Composer } from './Composer';

/** One message row: avatar, author, time, and the prettified body. */
function MessageRow({ message }: { message: SlackMessage }) {
  return (
    <div className="flex gap-2 px-3 py-1.5 hover:bg-muted/40">
      <Avatar name={message.userName} avatarUrl={message.userAvatarUrl} className="size-8" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-neutral-100">{message.userName}</span>
          <span className="text-[11px] text-muted-foreground">{relativeTime(message.ts)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-neutral-200">
          {prettySlackText(message.text)}
        </p>
      </div>
    </div>
  );
}

/**
 * The right column: the active channel's recent history over a composer. Empty
 * states cover "no channel picked" and "no messages yet".
 */
export function MessagePane() {
  const activeChannelId = useSlack((s) => s.activeChannelId);
  const channels = useSlack(selectedChannels);
  const messages = useSlack((s) => (activeChannelId ? s.messagesByChannel[activeChannelId] : undefined));
  const loading = useSlack((s) => s.messagesLoading);

  const active = channels.find((c) => c.id === activeChannelId);

  if (!activeChannelId || !active) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Pick a channel to read and reply.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-border bg-secondary px-3 py-1.5">
        <ChannelIcon kind={active.kind} />
        <span className="text-sm font-semibold text-neutral-100">{active.name}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto py-2">
        {/* flex-col-reverse keeps the latest message pinned to the bottom. */}
        <div className="flex flex-col">
          {messages && messages.length > 0 ? (
            messages.map((m) => <MessageRow key={m.ts} message={m} />)
          ) : (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              {loading ? 'Loading messages…' : 'No messages yet.'}
            </div>
          )}
        </div>
      </div>

      <Composer channelName={active.name} />
    </div>
  );
}
