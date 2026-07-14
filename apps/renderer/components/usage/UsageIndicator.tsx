'use client';

import { useState } from 'react';
import type {
  UsageAttribution,
  UsageBehavior,
  UsageModelWindow,
  UsageWindow,
  UsageWindowBreakdown,
} from '@flowstate/shared';
import { useUsage, useUsageSync } from '@/lib/usage';
import { cn } from '../ui/cn';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';

///////////
// Types //
///////////

type Row = { label: string; window: UsageWindow };
type WindowKey = 'day' | 'week';

///////////////
// Constants //
///////////////

/** Placeholder window used before filtering — never rendered (utilization null). */
const EMPTY_WINDOW: UsageWindow = { utilization: null, resetsAt: null };

/** Shared footer container — same box for the loading and loaded states. */
const FOOTER_CLASS =
  'flex flex-row flex-wrap gap-x-4 gap-y-2 border-t border-border px-3 py-2.5';

/** Labels shown as the loading skeleton before the first snapshot arrives. */
const LOADING_LABELS = ['Session', 'Weekly', 'Fable'];

/** Friendly names for the SDK's raw behavior keys. */
const BEHAVIOR_LABELS: Record<string, string> = {
  subagent_heavy: 'Subagent-heavy',
  long_context: '>150k context',
  high_parallel: 'Parallel sessions',
  cache_miss: 'Cache misses',
  cron: 'Scheduled',
};

/////////////
// Helpers //
/////////////

/** "Jul 13 at 8:20 PM" — mirrors the /usage reset-time phrasing (hover title). */
function formatReset(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleString(undefined, { month: 'short', day: 'numeric' });
  const time = date.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
}

/** 12487 → "12.5k", 307 → "307". */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

/** The Fable per-model window, if the SDK reports one. */
function findFable(models: UsageModelWindow[]): UsageWindow | null {
  return models.find((m) => m.displayName.toLowerCase() === 'fable') ?? null;
}

/** Top-N contributors as "name 12% · name 8%", highest first; '' when empty. */
function topItems(items: UsageAttribution[], n = 4): string {
  return [...items]
    .filter((i) => i.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, n)
    .map((i) => `${i.name} ${Math.round(i.pct)}%`)
    .join(' · ');
}

/** Top-N behaviors as labelled rows, highest first; [] when empty. */
function topBehaviorRows(items: UsageBehavior[], n = 4): { label: string; pct: number }[] {
  return [...items]
    .filter((b) => b.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, n)
    .map((b) => ({ label: BEHAVIOR_LABELS[b.key] ?? b.key, pct: Math.round(b.pct) }));
}

///////////////////
// Sub-components //
///////////////////

/** A subtle grey progress bar (shared by the footer meters and behavior rows). */
function Bar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn('h-1 overflow-hidden rounded-full bg-white/10', className)}>
      <div
        className="h-full rounded-full bg-muted-foreground"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

/** One "Label items" line in the hover breakdown; renders nothing when empty. */
function DetailLine({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <p className="text-[11px] leading-snug text-muted-foreground">
      <span className="text-muted-foreground/60">{label} </span>
      {value}
    </p>
  );
}

/** The 24h / 7d segmented toggle in the hover header. */
function WindowToggle({ value, onChange }: { value: WindowKey; onChange: (w: WindowKey) => void }) {
  const option = (key: WindowKey, label: string) => (
    <button
      type="button"
      onClick={() => onChange(key)}
      aria-pressed={value === key}
      className={cn(
        'rounded px-1.5 py-0.5 text-[11px] tabular-nums transition-colors',
        value === key
          ? 'bg-muted text-neutral-100'
          : 'text-muted-foreground hover:text-neutral-300',
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-0.5">
      {option('day', '24h')}
      {option('week', '7d')}
    </div>
  );
}

/** The selected window's breakdown: counts, behavior bars, contributor lines. */
function WindowDetail({ window: w }: { window: UsageWindowBreakdown }) {
  const behaviors = topBehaviorRows(w.behaviors);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] tabular-nums text-muted-foreground">
        {formatCount(w.requestCount)} requests · {formatCount(w.sessionCount)} sessions
      </p>

      {behaviors.length > 0 && (
        <div className="flex flex-col gap-1">
          {behaviors.map((b) => (
            <div key={b.label} className="flex items-center gap-2 text-[11px]">
              <span className="w-24 shrink-0 truncate text-muted-foreground">{b.label}</span>
              <Bar pct={b.pct} className="flex-1" />
              <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                {b.pct}%
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        <DetailLine label="Skills" value={topItems(w.skills)} />
        <DetailLine label="Subagents" value={topItems(w.subagents)} />
        <DetailLine label="MCP" value={topItems(w.mcpServers)} />
      </div>
    </div>
  );
}

////////////////
// Component  //
////////////////

/**
 * Claude subscription usage at the bottom of the Skills & Actions panel: a
 * horizontal row of small "label over a thin progress bar" cells (Session /
 * Weekly / Fable), all subtle plain text. Hovering opens a menu with the
 * contribution breakdown ("where usage is going") for a selectable 24h / 7d
 * window. Shows a loading skeleton until the first snapshot lands, and hides on
 * API-key / third-party sessions.
 */
export function UsageIndicator() {
  useUsageSync();
  const limits = useUsage((s) => s.limits);
  const [windowKey, setWindowKey] = useState<WindowKey>('week');

  // No snapshot yet → subtle loading skeleton (dim labels + pulsing bars) rather
  // than an empty footer while the first poll is in flight.
  if (!limits) {
    return (
      <div className={FOOTER_CLASS}>
        {LOADING_LABELS.map((label) => (
          <div key={label} className="flex min-w-0 flex-1 basis-14 flex-col gap-1">
            <span className="truncate text-[11px] text-muted-foreground/50">{label}</span>
            <div className="h-1 animate-pulse rounded-full bg-white/10" />
          </div>
        ))}
      </div>
    );
  }

  // Definitively no plan limits (API-key / third-party session) → hide entirely.
  if (!limits.subscriptionType) return null;

  const rows: Row[] = [
    { label: 'Session', window: limits.session ?? EMPTY_WINDOW },
    { label: 'Weekly', window: limits.weekly ?? EMPTY_WINDOW },
    { label: 'Fable', window: findFable(limits.models) ?? EMPTY_WINDOW },
  ].filter((r) => r.window.utilization !== null);
  if (rows.length === 0) return null;

  const { breakdown } = limits;

  const meters = (
    <div className={cn(FOOTER_CLASS, breakdown && 'cursor-help')}>
      {rows.map((r) => {
        const pct = Math.round(r.window.utilization ?? 0);
        const reset = formatReset(r.window.resetsAt);
        return (
          <div
            key={r.label}
            className="flex min-w-0 flex-1 basis-14 flex-col gap-1"
            title={reset ? `${r.label} · resets ${reset}` : r.label}
          >
            <div className="flex items-baseline justify-between gap-1.5 text-[11px] text-muted-foreground">
              <span className="truncate">{r.label}</span>
              <span className="shrink-0 tabular-nums">{pct}%</span>
            </div>
            <Bar pct={pct} />
          </div>
        );
      })}
    </div>
  );

  // No contribution breakdown from the SDK → just the meters, no hover menu.
  if (!breakdown) return meters;

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>{meters}</HoverCardTrigger>
      <HoverCardContent side="top" align="end" className="w-72 p-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">Where your usage is going</p>
            <WindowToggle value={windowKey} onChange={setWindowKey} />
          </div>
          <WindowDetail window={breakdown[windowKey]} />
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            Approximate — from local sessions on this machine only, not other devices or claude.ai.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
