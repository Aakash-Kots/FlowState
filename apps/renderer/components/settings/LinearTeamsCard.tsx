'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { type LinearTeam } from '@flowstate/shared';
import {
  reindexAllTeams,
  refreshIssues,
  setSelectedTeam,
  useLinear,
} from '@/lib/linear';
import { useOnboarding } from '@/lib/onboarding';
import { setDefaultTeam, setSurfacedTeamIds, useSettings } from '@/lib/settings';
import { trpc } from '@/lib/trpc';
import { cn } from '../ui/cn';

///////////////
// Constants //
///////////////

const SELECT_CLASS =
  'h-9 rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/60';

/////////////
// Helpers //
/////////////

/** True when a team is currently surfaced (empty setting = every team). */
function isSurfaced(surfacedIds: string[], teamId: string): boolean {
  return surfacedIds.length === 0 || surfacedIds.includes(teamId);
}

////////////
// Export //
////////////

/**
 * Choose which Linear teams' issues to surface (browser list, team pickers,
 * assigned-work sections, semantic index) and which team a new ticket defaults
 * to. Fetches the full team list itself (independent of the surface filter);
 * persists through the settings store and re-fetches the Linear lists on change.
 * No teams checked is impossible — at least one stays surfaced; all checked is
 * stored as "empty" so newly-added teams auto-surface.
 */
export function LinearTeamsCard() {
  const linearConnected = useOnboarding((s) => s.linearConnected);
  const surfacedTeamIds = useSettings((s) => s.surfacedTeamIds);
  const defaultTeamId = useSettings((s) => s.defaultTeamId);

  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [loading, setLoading] = useState(true);

  // Pull every team the token can see — the picker needs the full list even for
  // teams the user has hidden from the rest of the app.
  useEffect(() => {
    if (!linearConnected) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    trpc()
      .linear.teams.query()
      .then((t) => {
        if (alive) setTeams(t);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [linearConnected]);

  /** Persist a new surfaced set, then reconcile the default team, the browser's
   * team filter, and the loaded lists / index. */
  const applySurfaced = (next: string[]) => {
    // All teams checked → store empty so future teams surface automatically.
    const normalized = next.length === teams.length ? [] : next;
    setSurfacedTeamIds(normalized);

    // Repoint the default team if it's no longer surfaced.
    if (defaultTeamId && !isSurfaced(normalized, defaultTeamId)) {
      setDefaultTeam(normalized[0] ?? null);
    }

    // A now-hidden team can't stay selected in the FilterBar — clearing refetches.
    const selected = useLinear.getState().selectedTeamId;
    if (selected && !isSurfaced(normalized, selected)) setSelectedTeam(null);
    else void refreshIssues();
    reindexAllTeams();
  };

  const toggleTeam = (teamId: string) => {
    const effective = surfacedTeamIds.length ? surfacedTeamIds : teams.map((t) => t.id);
    if (effective.includes(teamId)) {
      const next = effective.filter((id) => id !== teamId);
      if (next.length === 0) return; // keep at least one team surfaced
      applySurfaced(next);
    } else {
      applySurfaced([...effective, teamId]);
    }
  };

  // Teams eligible as the default (those currently surfaced).
  const defaultOptions = teams.filter((t) => isSurfaced(surfacedTeamIds, t.id));

  if (!linearConnected) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect Linear in onboarding to choose which teams to surface.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading teams…
      </div>
    );
  }

  if (teams.length === 0) {
    return <p className="text-sm text-muted-foreground">No Linear teams found.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {teams.map((team) => {
          const checked = isSurfaced(surfacedTeamIds, team.id);
          return (
            <button
              key={team.id}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => toggleTeam(team.id)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                  checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                )}
              >
                {checked && <Check className="size-3" />}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{team.key}</span>
              <span className="min-w-0 flex-1 truncate text-neutral-200">{team.name}</span>
            </button>
          );
        })}
        <p className="px-2 pt-1 text-xs text-muted-foreground">
          When every team is selected, all teams are surfaced — including any added later.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground">Default team</p>
          <p className="text-xs text-muted-foreground">
            Preselected when you create a new ticket.
          </p>
        </div>
        <select
          aria-label="Default team for new tickets"
          value={defaultTeamId ?? ''}
          onChange={(e) => setDefaultTeam(e.target.value || null)}
          className={SELECT_CLASS}
        >
          <option value="">First surfaced team</option>
          {defaultOptions.map((team) => (
            <option key={team.id} value={team.id}>
              {team.key} · {team.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
