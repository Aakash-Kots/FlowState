'use client';

import { useEffect, useState } from 'react';
import { AnalyticsRange, type AnalyticsSummary } from '@flowstate/shared';
import { GitCommit, Terminal, X } from 'lucide-react';
import {
  RANGE_OPTIONS,
  formatCompact,
  formatPct,
  formatUsd,
  useAnalyticsSummary,
} from '@/lib/analytics';
import { formatDuration } from '@/lib/format';
import { setAnalyticsOpen } from '@/lib/settings';
import { Card, CardHeader } from '../ui/Card';
import { cn } from '../ui/cn';
import {
  CommitsBarChart,
  ModelBarChart,
  SpendAreaChart,
  TokensAreaChart,
  TurnsBarChart,
  WorkspaceBarChart,
} from './charts';

/////////////
// Helpers //
/////////////

/** Total tokens across every bucket in the range. */
function totalTokens(s: AnalyticsSummary): number {
  const t = s.totals;
  return t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheCreationTokens;
}

///////////////////
// Sub-components //
///////////////////

/** The 7d / 30d / All segmented toggle in the page header. */
function RangeToggle({
  value,
  onChange,
}: {
  value: AnalyticsRange;
  onChange: (r: AnalyticsRange) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={cn(
            'rounded px-2 py-0.5 text-xs tabular-nums transition-colors',
            value === opt.value
              ? 'bg-muted text-neutral-100'
              : 'text-muted-foreground hover:text-neutral-300',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** A headline KPI: big value, label, optional secondary line. */
function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-100">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

/** A titled card that frames one chart, with an empty state when there's no data. */
function ChartCard({
  title,
  subtitle,
  isEmpty,
  emptyLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  isEmpty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="p-3">
        {isEmpty ? (
          <div className="flex h-56 items-center justify-center text-center text-xs text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

////////////////
// Page       //
////////////////

/**
 * The full-screen Analytics surface, rendered in place of the workspace body when
 * `analyticsOpen`. Shows how FlowState has been used over a selectable range —
 * Claude spend/tokens/models, turn errors, worktree lifecycle, commits, and
 * terminal runs — from the local usage and activity ledgers. Closes on Esc or the
 * header ✕.
 */
export function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>(AnalyticsRange.Last30Days);
  const { data, loading, error } = useAnalyticsSummary(range);

  // Esc closes the page — matches the Settings surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAnalyticsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-sm font-semibold text-foreground">Analytics</h1>
        <div className="flex items-center gap-3">
          <RangeToggle value={range} onChange={setRange} />
          <button
            type="button"
            onClick={() => setAnalyticsOpen(false)}
            title="Close analytics"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
            <span className="sr-only">Close analytics</span>
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-6">
          {error ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Couldn&apos;t load analytics.
            </div>
          ) : !data ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              {loading ? 'Loading analytics…' : 'No data yet.'}
            </div>
          ) : (
            <AnalyticsContent data={data} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The rendered dashboard once a summary has loaded. */
function AnalyticsContent({ data }: { data: AnalyticsSummary }) {
  const { totals, lifecycle, commitStats, terminalRunStats } = data;

  return (
    <div className="space-y-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Spend (API-equiv.)" value={formatUsd(totals.costUsd)} hint="Money not spent on a plan" />
        <StatTile label="Tokens" value={formatCompact(totalTokens(data))} hint={`${formatCompact(totals.turns)} turns`} />
        <StatTile
          label="Sessions"
          value={formatCompact(totals.sessions)}
          hint={`${formatCompact(totals.turns)} turns`}
        />
        <StatTile
          label="Error rate"
          value={formatPct(totals.errors, totals.turns)}
          hint={`${formatCompact(totals.errors)} errored`}
        />
        <StatTile
          label="Commits"
          value={formatCompact(commitStats.commits)}
          hint={`+${formatCompact(commitStats.insertions)} −${formatCompact(commitStats.deletions)}`}
        />
        <StatTile
          label="Active worktrees"
          value={formatCompact(lifecycle.worktreesActive)}
          hint={`${formatCompact(lifecycle.worktreesArchived)} archived`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Spend over time"
          subtitle="API-equivalent cost per day"
          isEmpty={data.usageByDay.length === 0}
          emptyLabel="No Claude usage recorded in this range yet."
        >
          <SpendAreaChart data={data.usageByDay} />
        </ChartCard>

        <ChartCard
          title="Tokens over time"
          subtitle="Input, output & cache per day"
          isEmpty={data.usageByDay.length === 0}
          emptyLabel="No Claude usage recorded in this range yet."
        >
          <TokensAreaChart data={data.usageByDay} />
        </ChartCard>

        <ChartCard
          title="Turns & errors"
          subtitle="Finished turns per day"
          isEmpty={data.usageByDay.length === 0}
          emptyLabel="No Claude usage recorded in this range yet."
        >
          <TurnsBarChart data={data.usageByDay} />
        </ChartCard>

        <ChartCard
          title="Spend by model"
          subtitle="Highest first"
          isEmpty={data.usageByModel.length === 0}
          emptyLabel="No Claude usage recorded in this range yet."
        >
          <ModelBarChart data={data.usageByModel} />
        </ChartCard>

        <ChartCard
          title="Spend by workspace"
          subtitle="Top worktrees"
          isEmpty={data.usageByWorkspace.length === 0}
          emptyLabel="No Claude usage recorded in this range yet."
        >
          <WorkspaceBarChart data={data.usageByWorkspace} />
        </ChartCard>

        <ChartCard
          title="Commits over time"
          subtitle="Commits made from FlowState"
          isEmpty={data.commitsByDay.length === 0}
          emptyLabel="No commits recorded yet — new commits from the changes view will show here."
        >
          <CommitsBarChart data={data.commitsByDay} />
        </ChartCard>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-4 px-4 py-3">
          <Terminal className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Terminal script runs</div>
            <div className="mt-0.5 text-sm text-neutral-100">
              <span className="font-semibold tabular-nums">{formatCompact(terminalRunStats.runs)}</span> runs ·{' '}
              <span className="tabular-nums">{formatCompact(terminalRunStats.failures)}</span> failed ·{' '}
              <span className="tabular-nums">
                {terminalRunStats.avgDurationMs == null
                  ? '—'
                  : formatDuration(terminalRunStats.avgDurationMs)}
              </span>{' '}
              avg
            </div>
          </div>
        </Card>

        <Card className="flex items-center gap-4 px-4 py-3">
          <GitCommit className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Worktree lifecycle</div>
            <div className="mt-0.5 text-sm text-neutral-100">
              <span className="font-semibold tabular-nums">{formatCompact(lifecycle.worktreesTotal)}</span> total ·{' '}
              <span className="tabular-nums">{formatCompact(lifecycle.projects)}</span> projects ·{' '}
              <span className="tabular-nums">
                {lifecycle.avgWorktreeLifespanMs == null
                  ? '—'
                  : formatDuration(lifecycle.avgWorktreeLifespanMs)}
              </span>{' '}
              avg life
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
