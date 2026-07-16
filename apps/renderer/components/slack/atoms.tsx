'use client';

import { Hash, Lock, User, Users } from 'lucide-react';
import { SlackChannelKind } from '@flowstate/shared';
import { cn } from '../ui/cn';

/**
 * Small presentational atoms shared across the Slack tab: a per-conversation-kind
 * icon, a user avatar (image or initial fallback), a relative timestamp, and a
 * light prettifier for Slack's `<@U…>` / `<url|label>` markup.
 */

/** An icon cueing a conversation's kind (channel, private, DM, group DM). */
export function ChannelIcon({ kind, className }: { kind: SlackChannelKind; className?: string }) {
  const cls = cn('size-3.5 shrink-0 text-muted-foreground', className);
  switch (kind) {
    case SlackChannelKind.Private:
      return <Lock className={cls} />;
    case SlackChannelKind.Im:
      return <User className={cls} />;
    case SlackChannelKind.Mpim:
      return <Users className={cls} />;
    default:
      return <Hash className={cls} />;
  }
}

/** A round user avatar — the image when available, else the name's initial. */
export function Avatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string;
  className?: string;
}) {
  const base = cn('shrink-0 rounded object-cover', className);
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} className={base} />;
  }
  return (
    <span
      className={cn(
        base,
        'flex items-center justify-center bg-muted text-[10px] font-medium uppercase text-muted-foreground',
      )}
    >
      {name.trim().charAt(0) || '?'}
    </span>
  );
}

/** A Slack ts ("1700000000.000100") rendered as a short relative time. */
export function relativeTime(ts: string): string {
  const seconds = Math.floor(Date.now() / 1000 - parseFloat(ts));
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Turn Slack's message markup into plain, readable text: unwrap `<url|label>` and
 * `<#C…|name>` / `<@U…|name>` links to their label, drop bare user/channel ids to
 * a generic token, and decode the three HTML entities Slack escapes.
 */
export function prettySlackText(text: string): string {
  return text
    .replace(/<([#@!])([^|>]+)\|([^>]+)>/g, (_m, sigil, _id, label) =>
      sigil === '#' ? `#${label}` : `@${label}`,
    )
    .replace(/<#[^|>]+>/g, '#channel')
    .replace(/<@[^|>]+>/g, '@user')
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, (_m, _url, label) => label)
    .replace(/<(https?:[^>]+)>/g, (_m, url) => url)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
