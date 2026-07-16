'use client';

import { cn } from '../ui/cn';

/**
 * Small presentational atoms shared by the Linear issue list and detail: a
 * workflow-state colour dot and a user avatar (image, or initial fallback).
 */

/** A filled dot in the state's Linear-assigned hex colour. */
export function StateDot({
  color,
  title,
  className,
}: {
  color: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      title={title}
      style={{ backgroundColor: color }}
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
    />
  );
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
  const base = cn('shrink-0 rounded-full object-cover', className);
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
