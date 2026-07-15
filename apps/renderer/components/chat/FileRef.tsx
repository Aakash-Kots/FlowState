'use client';

import { fileTypeForPath } from '@/lib/constants/fileTypes';
import { cn } from '../ui/cn';

/////////////
// Helpers //
/////////////

/** Trailing path segment (filename) for a compact chip label. */
function basename(path: string): string {
  const base = path.split('/').pop();
  return base && base.length > 0 ? base : path;
}

////////////
// Export //
////////////

/**
 * A file reference rendered as a compact chip: the file's type icon (a real
 * language logo for code files, a config/neutral glyph otherwise) next to its
 * basename, wrapped in a square cream border. The single visual for "a file"
 * across the chat — tool rows and the turn summary both compose it.
 */
export function FileRef({ path, className }: { path: string; className?: string }) {
  const { Icon, color } = fileTypeForPath(path);
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 rounded-md border border-primary/50 bg-primary/5 px-1.5 py-0.5',
        className,
      )}
      title={path}
    >
      <Icon className={cn('size-3.5 shrink-0', color)} />
      <span className="min-w-0 truncate font-mono text-neutral-200">{basename(path)}</span>
    </span>
  );
}
