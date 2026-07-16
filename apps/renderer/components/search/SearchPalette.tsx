'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ExternalLink, FileCode, GitBranch } from 'lucide-react';
import { type LinearIssue } from '@flowstate/shared';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { openIssueInLinearTab, useLinear } from '@/lib/linear';
import { useOnboarding } from '@/lib/onboarding';
import { setFileFinderOpen, useShortcuts } from '@/lib/shortcuts/store';
import { trpc } from '@/lib/trpc';
import { openFileTab, selectWorkspace, useWorkspace } from '@/lib/workspace';
import { Markdown } from '../chat/Markdown';
import { Avatar, ClaudeStateDot, StateDot } from '../linear/atoms';
import { PrBadge } from '../linear/PrBadge';
import { PriorityIcon, priorityLabel } from '../linear/PriorityIcon';

///////////////
// Constants //
///////////////

/** Debounce before a keystroke widens the ticket pool with a server search. */
const SEARCH_DEBOUNCE_MS = 300;

/** Longest description slice rendered in the preview (full text lives in the tab). */
const SNIPPET_CHARS = 600;

/////////////
// Helpers //
/////////////

/** De-duplicate issues by id, keeping first occurrence. */
function dedupById(issues: LinearIssue[]): LinearIssue[] {
  const seen = new Set<string>();
  const out: LinearIssue[] = [];
  for (const issue of issues) {
    if (seen.has(issue.id)) continue;
    seen.add(issue.id);
    out.push(issue);
  }
  return out;
}

/** Merge server results into the pool (fresher server copy wins), keeping order. */
function mergeById(prev: LinearIssue[], incoming: LinearIssue[]): LinearIssue[] {
  const byId = new Map(prev.map((i) => [i.id, i]));
  for (const issue of incoming) byId.set(issue.id, issue);
  return [...byId.values()];
}

/** A short, tree-cheap description slice for the preview (avoids huge markdown). */
function snippet(description: string | null): string | null {
  const text = description?.trim();
  if (!text) return null;
  return text.length > SNIPPET_CHARS ? `${text.slice(0, SNIPPET_CHARS).trimEnd()}…` : text;
}

///////////////
// Sub-views //
///////////////

/** The right-hand preview for a highlighted issue: metadata, snippet, worktrees. */
function IssuePreview({ issue, onOpen }: { issue: LinearIssue; onOpen: (issue: LinearIssue) => void }) {
  const linked = useLinear((s) => s.linkedWorktrees.filter((w) => w.issueId === issue.id));
  const description = snippet(issue.description);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Header: identifier + open-in-Linear, priority, PR */}
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{issue.identifier}</span>
          <button
            type="button"
            onClick={() => void trpc().app.openExternal.mutate({ url: issue.url })}
            title="Open in Linear"
            className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </button>
          <span className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <PriorityIcon priority={issue.priority} />
              {priorityLabel(issue.priority)}
            </span>
            {issue.pr && <PrBadge pr={issue.pr} />}
          </span>
        </div>

        <h2 className="mb-3 text-lg font-semibold leading-snug text-neutral-100">{issue.title}</h2>

        {/* State + assignee */}
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <StateDot color={issue.state.color} />
            <span className="text-neutral-300">{issue.state.name}</span>
          </span>
          <span className="flex items-center gap-1.5">
            {issue.assignee ? (
              <>
                <Avatar
                  name={issue.assignee.name}
                  avatarUrl={issue.assignee.avatarUrl}
                  className="size-4"
                />
                <span className="text-neutral-300">{issue.assignee.name}</span>
              </>
            ) : (
              <span>Unassigned</span>
            )}
          </span>
        </div>

        {/* Description snippet (faded) */}
        {description ? (
          <div className="relative mb-4 max-h-48 overflow-hidden">
            <Markdown>{description}</Markdown>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent" />
          </div>
        ) : (
          <p className="mb-4 text-xs italic text-muted-foreground">No description.</p>
        )}

        {/* Linked worktrees */}
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Linked worktrees
        </h3>
        {linked.length === 0 ? (
          <p className="text-xs text-muted-foreground">None yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {linked.map((w) => (
              <button
                key={w.workspaceId}
                type="button"
                onClick={() => {
                  setFileFinderOpen(false);
                  void selectWorkspace(w.workspaceId);
                }}
                className="group flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
              >
                <ClaudeStateDot state={w.claudeState} />
                <span className="min-w-0 flex-1 truncate text-neutral-300">{w.name}</span>
                <span className="flex shrink-0 items-center gap-1 font-mono text-muted-foreground">
                  <GitBranch className="size-3" />
                  <span className="max-w-[8rem] truncate">{w.branch}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* See more → the Linear tab */}
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={() => onOpen(issue)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-muted px-3 py-2 text-sm font-medium text-neutral-100 transition-colors hover:bg-accent"
        >
          See more
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** The right pane: an issue preview, a file hint, or a neutral placeholder. */
function PreviewPane({
  issue,
  filePath,
  onOpenIssue,
}: {
  issue: LinearIssue | null;
  filePath: string | null;
  onOpenIssue: (issue: LinearIssue) => void;
}) {
  if (issue) return <IssuePreview issue={issue} onOpen={onOpenIssue} />;
  if (filePath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <FileCode className="size-6 text-muted-foreground" />
        <span className="break-all text-xs text-neutral-300">{filePath}</span>
        <span className="text-xs text-muted-foreground">Press Enter to open</span>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
      Select a result to preview it.
    </div>
  );
}

////////////
// Export //
////////////

/**
 * ⌘P unified search: fuzzy-finds git-tracked files AND Linear issues in one
 * dialog. Files open as a tab; highlighting an issue previews it on the right,
 * and choosing it (Enter / "See more") opens it in the Linear tab. Issues seed
 * instantly from the synced Linear store, then a debounced server search widens
 * the pool to the full backlog as the user types.
 */
export function SearchPalette() {
  const open = useShortcuts((s) => s.fileFinderOpen);
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const linearConnected = useOnboarding((s) => s.linearConnected);

  const [files, setFiles] = useState<string[] | null>(null);
  const [candidates, setCandidates] = useState<LinearIssue[]>([]);
  const [query, setQuery] = useState('');
  const [activeValue, setActiveValue] = useState('');
  const [searching, setSearching] = useState(false);
  const reqToken = useRef(0);

  // On open: reset input, fetch files, and seed issues from the synced store.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveValue('');
    setSearching(false);

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

    if (linearConnected) {
      const { myWorkIssues, issues } = useLinear.getState();
      setCandidates(dedupById([...myWorkIssues, ...issues]));
    } else {
      setCandidates([]);
    }

    return () => {
      cancelled = true;
    };
  }, [open, workspaceId, linearConnected]);

  // Debounced server search — widens the issue pool beyond the local seed.
  useEffect(() => {
    if (!open || !linearConnected) return;
    const q = query.trim();
    if (!q) {
      setSearching(false);
      return;
    }
    const token = ++reqToken.current;
    setSearching(true);
    const timer = setTimeout(() => {
      trpc()
        .linear.issues.query({ query: q })
        .then((results) => {
          if (token !== reqToken.current) return;
          setCandidates((prev) => mergeById(prev, results));
        })
        .catch(() => {})
        .finally(() => {
          if (token === reqToken.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open, linearConnected]);

  // Value → item lookups (lowercased: cmdk normalizes the highlighted value).
  const issuesByValue = useMemo(() => {
    const map = new Map<string, LinearIssue>();
    for (const issue of candidates) map.set(issue.id.toLowerCase(), issue);
    return map;
  }, [candidates]);
  const filesByValue = useMemo(() => {
    const map = new Map<string, string>();
    for (const path of files ?? []) map.set(path.toLowerCase(), path);
    return map;
  }, [files]);

  const activeKey = activeValue.toLowerCase();
  const activeIssue = issuesByValue.get(activeKey) ?? null;
  const activeFile = activeIssue ? null : (filesByValue.get(activeKey) ?? null);

  const chooseFile = (path: string) => {
    setFileFinderOpen(false);
    void openFileTab(path);
  };
  const chooseIssue = (issue: LinearIssue) => {
    setFileFinderOpen(false);
    openIssueInLinearTab(issue);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setFileFinderOpen}
      contentClassName="max-w-3xl"
      commandClassName="h-[28rem] flex-row"
      value={activeValue}
      onValueChange={setActiveValue}
    >
      {/* Left: input + results */}
      <div className="flex min-w-0 flex-1 flex-col">
        <CommandInput
          placeholder={linearConnected ? 'Search files and issues…' : 'Search files…'}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-none min-h-0 flex-1">
          <CommandEmpty>{files === null ? 'Loading…' : 'No matches.'}</CommandEmpty>

          {files && files.length > 0 && (
            <CommandGroup heading="Files">
              {files.map((path) => (
                <CommandItem key={path} value={path} onSelect={() => chooseFile(path)}>
                  <FileCode className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{path}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {linearConnected && candidates.length > 0 && (
            <CommandGroup heading={searching ? 'Issues · searching…' : 'Issues'}>
              {candidates.map((issue) => (
                <CommandItem
                  key={issue.id}
                  value={issue.id}
                  keywords={
                    [issue.identifier, issue.title, issue.state.name, issue.assignee?.name].filter(
                      Boolean,
                    ) as string[]
                  }
                  onSelect={() => chooseIssue(issue)}
                >
                  <PriorityIcon priority={issue.priority} className="shrink-0" />
                  <StateDot color={issue.state.color} title={issue.state.name} />
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {issue.identifier}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                  {issue.pr && <PrBadge pr={issue.pr} />}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </div>

      {/* Right: preview */}
      <aside className="w-80 shrink-0 border-l border-border">
        <PreviewPane issue={activeIssue} filePath={activeFile} onOpenIssue={chooseIssue} />
      </aside>
    </CommandDialog>
  );
}
