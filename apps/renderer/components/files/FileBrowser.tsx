'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { fileTypeForPath } from '@/lib/constants/fileTypes';
import { trpc } from '@/lib/trpc';
import { openFileTab, useWorkspace } from '@/lib/workspace';
import { cn } from '../ui/cn';
import { FileTree } from './FileTree';

///////////////////
// Sub-components //
///////////////////

/** Flat, filtered file results while searching — mirrors the ⌘P finder. */
function SearchResults({ query }: { query: string }) {
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const [files, setFiles] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    trpc()
      .files.list.query({ workspaceId })
      .then((list) => {
        if (!cancelled) setFiles(list);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const matches = useMemo(() => {
    if (!files) return null;
    const q = query.toLowerCase();
    return files.filter((p) => p.toLowerCase().includes(q)).slice(0, 200);
  }, [files, query]);

  if (matches === null) {
    return <p className="px-3 pt-3 text-[11px] text-muted-foreground">Loading files…</p>;
  }
  if (matches.length === 0) {
    return <p className="px-3 pt-3 text-[11px] text-muted-foreground">No files match.</p>;
  }

  return (
    <div className="flex flex-col px-1 py-1">
      {matches.map((path) => {
        const { Icon, color } = fileTypeForPath(path);
        return (
          <button
            key={path}
            type="button"
            onClick={() => void openFileTab(path)}
            title={path}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-neutral-200 transition-colors hover:bg-muted"
          >
            <Icon className={cn('size-3.5 shrink-0', color)} />
            <span className="truncate">{path}</span>
          </button>
        );
      })}
    </div>
  );
}

////////////
// Export //
////////////

/**
 * The Files tab body: the worktree's on-disk file tree, plus a search box that
 * filters the files into a flat list. Clicking any file opens it in an editor
 * tab. Uncommitted changes are reviewed in the Git view, not here.
 */
export function FileBrowser() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const searching = searchOpen && query.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end px-2 py-1.5">
        <button
          type="button"
          onClick={() => {
            setSearchOpen((o) => !o);
            setQuery('');
          }}
          title="Search files"
          className={cn(
            'rounded-md p-1 transition-colors hover:bg-muted hover:text-foreground',
            searchOpen ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <Search className="size-4" />
        </button>
      </div>

      {searchOpen && (
        <div className="flex items-center gap-1.5 px-2 pb-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files…"
            className="min-w-0 flex-1 bg-transparent text-xs text-neutral-100 placeholder:text-muted-foreground focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              title="Clear"
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {searching ? <SearchResults query={query.trim()} /> : <FileTree />}
      </div>
    </div>
  );
}
