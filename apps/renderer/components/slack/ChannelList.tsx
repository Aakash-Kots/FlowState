'use client';

import { Settings2 } from 'lucide-react';
import { selectedChannels, setActiveChannel, setPickerOpen, useSlack } from '@/lib/slack';
import { cn } from '../ui/cn';
import { ChannelIcon } from './atoms';

/**
 * The left column: the channels the user follows, each opening in the message
 * pane. A "Manage" button opens the picker to add/remove channels. Empty until the
 * user picks at least one.
 */
export function ChannelList() {
  const channels = useSlack(selectedChannels);
  const activeChannelId = useSlack((s) => s.activeChannelId);

  return (
    <div className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Channels
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          title="Manage channels"
          className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings2 className="size-3.5" />
        </button>
      </div>

      {channels.length === 0 ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mx-2 mt-1 rounded border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground hover:bg-muted"
        >
          Pick channels to follow
        </button>
      ) : (
        <div className="flex flex-col px-1">
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveChannel(c.id)}
              className={cn(
                'flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors',
                c.id === activeChannelId ? 'bg-accent text-neutral-100' : 'hover:bg-muted',
              )}
            >
              <ChannelIcon kind={c.kind} />
              <span className="min-w-0 flex-1 truncate text-neutral-200">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
