'use client';

import { useEffect, useState } from 'react';
import { FileCode } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { setFileFinderOpen, useShortcuts } from '@/lib/shortcuts/store';
import { openFileTab, useWorkspace } from '@/lib/workspace';
import { trpc } from '@/lib/trpc';

/**
 * ⌘P file finder: a fuzzy-searchable list of every file under version control in
 * the active worktree (`git ls-files`). Choosing one opens it as a file tab.
 * Candidates are (re)fetched each time the dialog opens so the list stays fresh.
 */
export function FileFinder() {
  const open = useShortcuts((s) => s.fileFinderOpen);
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const [files, setFiles] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open, workspaceId]);

  const choose = (path: string) => {
    setFileFinderOpen(false);
    void openFileTab(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setFileFinderOpen}>
      <CommandInput placeholder="Search files…" />
      <CommandList>
        <CommandEmpty>{files === null ? 'Loading files…' : 'No files found.'}</CommandEmpty>
        {files && files.length > 0 && (
          <CommandGroup>
            {files.map((path) => (
              <CommandItem key={path} value={path} onSelect={() => choose(path)}>
                <FileCode className="mr-2 size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{path}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
