'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ExternalLink, FileCode, GitBranch } from 'lucide-react';
import { type LinearIssue } from '@flowstate/shared';
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ensureIssueDetail, issueRank, openIssueInLinearTab, rankIssues, useLinear } from '@/lib/linear';
import { useOnboarding } from '@/lib/onboarding';
import { fuzzyScore } from '@/lib/search';
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

/**
 * Cap on rendered rows per group. We filter/rank the full candidate set in JS and
 * only mount the best matches, so cmdk never scores (or lays out) thousands of
 * nodes per keystroke — the top slice is all the user can act on anyway.
 */
const RESULT_LIMIT = 50;

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
  // The list query omits the body to stay light; fetch the full issue on demand.
  const detail = useLinear((s) => s.issueDetailsById[issue.id]);
  useEffect(() => {
    void ensureIssueDetail(issue.id);
  }, [issue.id]);
  const description = snippet(detail?.description ?? issue.description);

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
  const linkedWorktrees = useLinear((s) => s.linkedWorktrees);

  const [files, setFiles] = useState<string[] | null>(null);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
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

    setRecentFiles([]);
    trpc()
      .files.recent.query({ workspaceId })
      .then((list) => {
        if (!cancelled) setRecentFiles(list);
      })
      .catch(() => {});

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

  // We own filtering (cmdk's `shouldFilter={false}`): match/rank in JS off a
  // deferred query so a fast typist isn't blocked on scoring the full set, and
  // only the top slice per group is ever mounted.
  const deferredQuery = useDeferredValue(query);
  const q = deferredQuery.trim();

  // Each candidate's searchable text, computed once per pool (not per keystroke).
  const issueSearchText = useMemo(
    () =>
      candidates.map((issue) => ({
        issue,
        text: `${issue.identifier} ${issue.title} ${issue.state.name} ${issue.assignee?.name ?? ''}`,
      })),
    [candidates],
  );

  // Files: fuzzy-match, best first, capped. Empty query shows none — the palette
  // opens on issues, not the whole worktree.
  const matchedFiles = useMemo(() => {
    if (!files || !q) return [];
    const scored: { path: string; score: number }[] = [];
    for (const path of files) {
      const score = fuzzyScore(path, q);
      if (score >= 0) scored.push({ path, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, RESULT_LIMIT).map((s) => s.path);
  }, [files, q]);

  // Issues: relevance bucket first (open-PR / in-progress / not-started above
  // finished), then match strength within a bucket. Only while typing — the empty
  // query shows the curated groups below instead.
  const matchedIssues = useMemo(() => {
    if (!q) return [];
    const scored: { issue: LinearIssue; score: number }[] = [];
    for (const { issue, text } of issueSearchText) {
      const score = fuzzyScore(text, q);
      if (score >= 0) scored.push({ issue, score });
    }
    scored.sort((a, b) => issueRank(a.issue) - issueRank(b.issue) || b.score - a.score);
    return scored.slice(0, RESULT_LIMIT).map((s) => s.issue);
  }, [issueSearchText, q]);

  // Empty-state groups (shown only before the user types). Recent files come from
  // the per-worktree MRU, intersected with the live list so deleted paths drop
  // out. Tickets split into those with a linked worktree vs. the rest.
  const worktreeIssueIds = useMemo(
    () => new Set(linkedWorktrees.map((w) => w.issueId)),
    [linkedWorktrees],
  );
  const recentGroup = useMemo(() => {
    if (q || !files) return [];
    const live = new Set(files);
    return recentFiles.filter((p) => live.has(p)).slice(0, RESULT_LIMIT);
  }, [q, files, recentFiles]);
  const activeTicketGroup = useMemo(() => {
    if (q) return [];
    return rankIssues(candidates.filter((i) => worktreeIssueIds.has(i.id))).slice(0, RESULT_LIMIT);
  }, [q, candidates, worktreeIssueIds]);
  const myIssuesGroup = useMemo(() => {
    if (q) return [];
    return rankIssues(candidates.filter((i) => !worktreeIssueIds.has(i.id))).slice(0, RESULT_LIMIT);
  }, [q, candidates, worktreeIssueIds]);

  const nothingToShow = q
    ? matchedFiles.length === 0 && matchedIssues.length === 0
    : recentGroup.length === 0 && activeTicketGroup.length === 0 && myIssuesGroup.length === 0;

  const chooseFile = (path: string) => {
    setFileFinderOpen(false);
    void openFileTab(path);
  };
  const chooseIssue = (issue: LinearIssue) => {
    setFileFinderOpen(false);
    openIssueInLinearTab(issue);
  };

  const fileItem = (path: string) => (
    <CommandItem key={path} value={path} onSelect={() => chooseFile(path)}>
      <FileCode className="size-4 shrink-0 text-muted-foreground" />
      {/* Clip the *front* of the path (dir=rtl truncates at the logical start) so
          a long path keeps its useful tail — filename + nearest folders — visible
          instead of the irrelevant repo-root prefix. The lrm marks (‎) pin the
          slashes to logical order so segments don't visually reorder under rtl. */}
      <span className="min-w-0 flex-1 truncate text-left" dir="rtl">
        {'‎'}
        {path}
        {'‎'}
      </span>
    </CommandItem>
  );
  const issueItem = (issue: LinearIssue) => (
    <CommandItem key={issue.id} value={issue.id} onSelect={() => chooseIssue(issue)}>
      <PriorityIcon priority={issue.priority} className="shrink-0" />
      <StateDot color={issue.state.color} title={issue.state.name} />
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{issue.identifier}</span>
      <span className="min-w-0 flex-1 truncate">{issue.title}</span>
      {issue.pr && <PrBadge pr={issue.pr} />}
    </CommandItem>
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setFileFinderOpen}
      contentClassName="max-w-3xl"
      commandClassName="h-[28rem] flex-row"
      value={activeValue}
      onValueChange={setActiveValue}
      shouldFilter={false}
    >
      {/* Left: input + results */}
      <div className="flex min-w-0 flex-1 flex-col">
        <CommandInput
          placeholder={linearConnected ? 'Search files and issues…' : 'Search files…'}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-none min-h-0 flex-1">
          {nothingToShow && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {files === null ? 'Loading…' : q ? 'No matches.' : 'Search files and issues…'}
            </div>
          )}

          {q ? (
            <>
              {matchedFiles.length > 0 && (
                <CommandGroup heading="Files">{matchedFiles.map(fileItem)}</CommandGroup>
              )}
              {linearConnected && matchedIssues.length > 0 && (
                <CommandGroup heading={searching ? 'Issues · searching…' : 'Issues'}>
                  {matchedIssues.map(issueItem)}
                </CommandGroup>
              )}
            </>
          ) : (
            <>
              {recentGroup.length > 0 && (
                <CommandGroup heading="Recent files">{recentGroup.map(fileItem)}</CommandGroup>
              )}
              {linearConnected && activeTicketGroup.length > 0 && (
                <CommandGroup heading="Active · worktrees">
                  {activeTicketGroup.map(issueItem)}
                </CommandGroup>
              )}
              {linearConnected && myIssuesGroup.length > 0 && (
                <CommandGroup heading="My issues">{myIssuesGroup.map(issueItem)}</CommandGroup>
              )}
            </>
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
