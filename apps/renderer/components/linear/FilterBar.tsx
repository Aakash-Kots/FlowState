'use client';

import { Check, ChevronDown, Loader2, Search, Sparkles } from 'lucide-react';
import { LocalModelState } from '@flowstate/shared';
import {
  ensureWorkflowStates,
  refreshUsers,
  setFilterAssignee,
  setFilterPriorities,
  setFilterStateIds,
  setIncludeCompleted,
  setSearchQuery,
  setSelectedTeam,
  useLinear,
} from '@/lib/linear';
import { Combobox } from '../ui/combobox';
import { cn } from '../ui/cn';
import { Avatar, StateDot } from './atoms';
import { PRIORITY_OPTIONS, PriorityIcon, priorityLabel } from './PriorityIcon';

///////////////
// Constants //
///////////////

const TRIGGER =
  'gap-1.5 rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted hover:text-neutral-100';

////////////
// Export //
////////////

/**
 * The command-center filter row: search + single-select Team / Status / Assignee
 * / Priority pickers (each clearable back to "any") and an "Include done" toggle.
 * Every change refetches the browser list via the store setters.
 */
export function FilterBar() {
  const teams = useLinear((s) => s.teams);
  const selectedTeamId = useLinear((s) => s.selectedTeamId);
  const searchQuery = useLinear((s) => s.searchQuery);
  const modelStatus = useLinear((s) => s.modelStatus);
  const semanticActive = useLinear((s) => s.semanticActive);
  const semanticSearching = useLinear((s) => s.semanticSearching);
  const users = useLinear((s) => s.users);
  const filterAssigneeId = useLinear((s) => s.filterAssigneeId);
  const filterStateIds = useLinear((s) => s.filterStateIds);
  const filterPriorities = useLinear((s) => s.filterPriorities);
  const includeCompleted = useLinear((s) => s.includeCompleted);
  const states = useLinear((s) => (selectedTeamId ? s.workflowStatesByTeam[selectedTeamId] ?? [] : []));

  // While the on-device model downloads/loads, show a prep hint in the search
  // box; once it's serving, a subtle "Smart" tag marks semantic-ranked results.
  const preparing =
    modelStatus?.state === LocalModelState.Downloading || modelStatus?.state === LocalModelState.Loading;
  const prepLabel =
    modelStatus?.state === LocalModelState.Downloading
      ? `Preparing smart search… ${Math.round((modelStatus.downloadProgress ?? 0) * 100)}%`
      : 'Loading smart search…';

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const selectedState = states.find((st) => st.id === filterStateIds[0]) ?? null;
  const selectedAssignee = users.find((u) => u.id === filterAssigneeId) ?? null;
  const selectedPriority = filterPriorities.length ? filterPriorities[0] : null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary px-3 py-2 text-sm">
      {/* Search */}
      <div className="relative min-w-[12rem] flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search issues…"
          spellCheck={false}
          className={cn(
            'h-8 w-full rounded-md border border-border bg-background pl-8 text-sm text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none',
            preparing ? 'pr-44' : semanticSearching ? 'pr-24' : semanticActive ? 'pr-16' : 'pr-2',
          )}
        />
        {preparing ? (
          <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {prepLabel}
          </span>
        ) : semanticSearching ? (
          <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Searching…
          </span>
        ) : (
          semanticActive && (
            <span
              className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[11px] text-primary"
              title="Results ranked by meaning (on-device)"
            >
              <Sparkles className="size-3" />
              Smart
            </span>
          )
        )}
      </div>

      {/* Team */}
      <Combobox
        items={teams}
        getKey={(t) => t.id}
        getFilterText={(t) => `${t.key} ${t.name}`}
        isSelected={(t) => t.id === selectedTeamId}
        onSelect={(t) => setSelectedTeam(t.id)}
        placeholder="Search teams…"
        emptyText="No teams"
        clear={{ label: 'All teams', active: !selectedTeamId, onClear: () => setSelectedTeam(null) }}
        triggerClassName={TRIGGER}
        trigger={
          <>
            <span className="max-w-[8rem] truncate text-neutral-200">
              {selectedTeam ? selectedTeam.key : 'Team'}
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

      {/* Status (scoped to the selected team) */}
      <Combobox
        items={states}
        disabled={!selectedTeamId}
        getKey={(st) => st.id}
        getFilterText={(st) => st.name}
        isSelected={(st) => st.id === filterStateIds[0]}
        onSelect={(st) => setFilterStateIds([st.id])}
        onOpen={() => selectedTeamId && void ensureWorkflowStates(selectedTeamId)}
        placeholder="Search states…"
        emptyText={selectedTeamId ? 'No states' : 'Pick a team first'}
        clear={{ label: 'Any status', active: !filterStateIds.length, onClear: () => setFilterStateIds([]) }}
        triggerClassName={cn(TRIGGER, !selectedTeamId && 'cursor-not-allowed opacity-50')}
        trigger={
          <>
            {selectedState && <StateDot color={selectedState.color} />}
            <span className="max-w-[8rem] truncate text-neutral-200">
              {selectedState ? selectedState.name : 'Status'}
            </span>
            <ChevronDown className="size-3 opacity-70" />
          </>
        }
        renderItem={(st) => (
          <>
            <StateDot color={st.color} />
            <span className="min-w-0 flex-1 truncate text-neutral-200">{st.name}</span>
          </>
        )}
      />

      {/* Assignee */}
      <Combobox
        items={users}
        getKey={(u) => u.id}
        getFilterText={(u) => `${u.displayName} ${u.name}`}
        isSelected={(u) => u.id === filterAssigneeId}
        onSelect={(u) => setFilterAssignee(u.id)}
        onOpen={() => void refreshUsers()}
        placeholder="Search users…"
        emptyText="No users"
        clear={{ label: 'Anyone', active: !filterAssigneeId, onClear: () => setFilterAssignee(null) }}
        triggerClassName={TRIGGER}
        trigger={
          <>
            {selectedAssignee && (
              <Avatar name={selectedAssignee.name} avatarUrl={selectedAssignee.avatarUrl} className="size-4" />
            )}
            <span className="max-w-[8rem] truncate text-neutral-200">
              {selectedAssignee ? selectedAssignee.displayName : 'Assignee'}
            </span>
            <ChevronDown className="size-3 opacity-70" />
          </>
        }
        renderItem={(u) => (
          <>
            <Avatar name={u.name} avatarUrl={u.avatarUrl} className="size-4" />
            <span className="min-w-0 flex-1 truncate text-neutral-200">{u.displayName}</span>
          </>
        )}
      />

      {/* Priority */}
      <Combobox
        items={PRIORITY_OPTIONS}
        getKey={(p) => String(p)}
        getFilterText={(p) => priorityLabel(p)}
        isSelected={(p) => p === selectedPriority}
        onSelect={(p) => setFilterPriorities([p])}
        placeholder="Search…"
        emptyText="No priorities"
        clear={{ label: 'Any priority', active: !filterPriorities.length, onClear: () => setFilterPriorities([]) }}
        triggerClassName={TRIGGER}
        trigger={
          <>
            {selectedPriority !== null && <PriorityIcon priority={selectedPriority} />}
            <span className="max-w-[8rem] truncate text-neutral-200">
              {selectedPriority !== null ? priorityLabel(selectedPriority) : 'Priority'}
            </span>
            <ChevronDown className="size-3 opacity-70" />
          </>
        }
        renderItem={(p) => (
          <>
            <PriorityIcon priority={p} />
            <span className="min-w-0 flex-1 truncate text-neutral-200">{priorityLabel(p)}</span>
          </>
        )}
      />

      {/* Include done toggle */}
      <button
        type="button"
        onClick={() => setIncludeCompleted(!includeCompleted)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-2 py-1 transition-colors',
          includeCompleted
            ? 'border-primary/60 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:bg-muted hover:text-neutral-100',
        )}
      >
        <Check className={cn('size-3', !includeCompleted && 'opacity-0')} />
        Done
      </button>
    </div>
  );
}
