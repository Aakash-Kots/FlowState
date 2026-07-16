'use client';

import { useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, X } from 'lucide-react';
import { refreshChannels, setPickerOpen, toggleFollowChannel, useSlack } from '@/lib/slack';
import { cn } from '../ui/cn';
import { ChannelIcon } from './atoms';

/**
 * Modal to choose which channels/DMs the user follows. Lists every conversation
 * the account can see with a follow toggle; the selection persists immediately via
 * `toggleFollowChannel`. A search box filters by name.
 */
export function ChannelPicker() {
  const open = useSlack((s) => s.pickerOpen);
  const channels = useSlack((s) => s.channels);
  const channelsLoading = useSlack((s) => s.channelsLoading);
  const selectedIds = useSlack((s) => s.selectedChannelIds);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? channels.filter((c) => c.name.toLowerCase().includes(q)) : channels;
    // Followed channels first, then alphabetical — keeps current picks visible.
    return [...rows].sort((a, b) => {
      const af = selectedIds.includes(a.id) ? 0 : 1;
      const bf = selectedIds.includes(b.id) ? 0 : 1;
      return af - bf || a.name.localeCompare(b.name);
    });
  }, [channels, query, selectedIds]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setPickerOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[70vh] w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
              Follow channels
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="px-4 py-3">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search channels…"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
            {filtered.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                {channelsLoading ? 'Loading channels…' : 'No channels found'}
              </div>
            ) : (
              filtered.map((c) => {
                const followed = selectedIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void toggleFollowChannel(c.id)}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <ChannelIcon kind={c.kind} />
                    <span className="min-w-0 flex-1 truncate text-neutral-200">{c.name}</span>
                    <span
                      className={cn(
                        'inline-flex size-4 items-center justify-center rounded border',
                        followed
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-transparent',
                      )}
                    >
                      <Check className="size-3" />
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <button
              type="button"
              onClick={() => void refreshChannels()}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Refresh list
            </button>
            <DialogPrimitive.Close className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Done
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
