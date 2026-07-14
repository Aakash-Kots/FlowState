'use client';

import { useState } from 'react';
import { Folder } from 'lucide-react';
import { useProjects } from '@/lib/projects';
import { cn } from '../ui/cn';

/**
 * A project's avatar: the GitHub owner's picture, falling back to the linked
 * user's own avatar, then a folder icon — advancing past any source that 404s or
 * fails to load (e.g. a local repo with no owner, or offline).
 */
export function ProjectAvatar({ owner, className }: { owner: string; className?: string }) {
  const viewer = useProjects((s) => s.viewer);
  const [failed, setFailed] = useState(0);
  const sources = [
    owner ? `https://github.com/${owner}.png?size=64` : null,
    viewer?.avatarUrl ?? null,
  ].filter((s): s is string => !!s);
  const src = sources[failed];
  if (!src) {
    return <Folder className={cn('size-5 shrink-0', className)} />;
  }
  return (
    // A tiny remote avatar in a statically-exported Electron app — `next/image`
    // buys nothing here (optimization is off) and can't take a bare remote URL.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={cn('size-5 shrink-0 rounded-sm object-cover', className)}
      onError={() => setFailed((n) => n + 1)}
    />
  );
}
