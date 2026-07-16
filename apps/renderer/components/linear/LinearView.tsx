'use client';

import { ChevronDown, RefreshCw, Search } from 'lucide-react';
import {
  refreshIssues,
  refreshLinkedWorktrees,
  setSearchQuery,
  setSelectedTeam,
  useLinear,
  useLinearSync,
} from '@/lib/linear';
import { useOnboarding } from '@/lib/onboarding';
import { Combobox } from '../ui/combobox';
import { cn } from '../ui/cn';
import { IssueDetail } from './IssueDetail';
import { IssueList } from './IssueList';

/**
 * The worktree-scoped Linear browser: a team/search header strip over a two-column
 * body (issue list ▸ issue detail). Mirrors `GitView`'s shell. Live sync (teams,
 * issues, linked worktrees, users, viewer) is owned by `useLinearSync`, mounted
 * here; the columns just read the store.
 */
export function LinearView() {
  useLinearSync();

  const linearConnected = useOnboarding((s) => s.linearConnected);
  const teams = useLinear((s) => s.teams);
  const selectedTeamId = useLinear((s) => s.selectedTeamId);
  const searchQuery = useLinear((s) => s.searchQuery);
  const loading = useLinear((s) => s.issuesLoading);
  const error = useLinear((s) => s.issuesError);

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;

  const refresh = () => {
    void refreshIssues();
    void refreshLinkedWorktrees();
  };

  if (!linearConnected) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
        Connect Linear from the Connect screen to browse issues here.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Team filter + search header strip */}
      <div className="flex items-center gap-3 border-b border-border bg-secondary px-3 py-1.5 text-xs">
        <Combobox
          items={teams}
          getKey={(t) => t.id}
          getFilterText={(t) => `${t.key} ${t.name}`}
          isSelected={(t) => t.id === selectedTeamId}
          onSelect={(t) => setSelectedTeam(t.id)}
          placeholder="Search teams…"
          emptyText="No teams"
          clear={{
            label: 'All teams',
            active: !selectedTeamId,
            onClear: () => setSelectedTeam(null),
          }}
          triggerClassName="gap-1.5 rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted hover:text-neutral-100"
          trigger={
            <>
              <span className="max-w-[12rem] truncate font-medium text-neutral-200">
                {selectedTeam ? `${selectedTeam.key} · ${selectedTeam.name}` : 'All teams'}
              </span>
              <ChevronDown className="size-3 opacity-70" />
            </>
          }
          renderItem={(t) => (
            <>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{t.key}</span>
              <span className="min-w-0 flex-1 truncate text-neutral-200">{t.name}</span>
            </>
          )}
        />

        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search issues…"
            spellCheck={false}
            className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={refresh}
          title="Refresh"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Body: issue list ▸ detail */}
      {error ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-danger">
          {error}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <IssueList />
          <IssueDetail />
        </div>
      )}
    </div>
  );
}
