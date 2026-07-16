'use client';

import type { SystemMetrics } from '@flowstate/shared';
import { useSystemStats, useSystemStatsSync } from '@/lib/systemStats';
import { cn } from '../ui/cn';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import { Bar, severityFill } from '../ui/Meter';

///////////
// Types //
///////////

type MetricRow = { label: string; pct: number };

/** Where the meters render: the top header (compact) or a fuller panel. */
type MetricsVariant = 'panel' | 'header';

///////////////
// Constants //
///////////////

/** The meter-row container per variant (same box for the loading and loaded states). */
const CONTAINER_CLASS: Record<MetricsVariant, string> = {
  panel: 'flex flex-row flex-wrap gap-x-4 gap-y-2 border-t border-border px-3 py-2.5',
  header: 'flex flex-row items-center gap-2',
};

/** A single meter cell per variant: fluid in the panel, fixed-width in the header. */
const METER_CLASS: Record<MetricsVariant, string> = {
  panel: 'flex min-w-0 flex-1 basis-14 flex-col gap-1',
  header: 'flex w-14 shrink-0 flex-col gap-0.5',
};

/** Progress-bar height per variant — slimmer in the space-tight header. */
const BAR_CLASS: Record<MetricsVariant, string> = {
  panel: '',
  header: 'h-0.5',
};

/** Labels shown as the loading skeleton before the first sample arrives. */
const LOADING_LABELS = ['RAM', 'Swap', 'CPU'];

/////////////
// Helpers //
/////////////

/** 17179869184 → "16.0 GB". */
function formatGb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** The meter rows to render — swap/GPU drop out when the platform has no value. */
function toRows(metrics: SystemMetrics): MetricRow[] {
  const rows: MetricRow[] = [{ label: 'RAM', pct: Math.round(metrics.ramPct) }];
  if (metrics.swapPct !== null) rows.push({ label: 'Swap', pct: Math.round(metrics.swapPct) });
  rows.push({ label: 'CPU', pct: Math.round(metrics.cpuPct) });
  if (metrics.gpuPct !== null) rows.push({ label: 'GPU', pct: Math.round(metrics.gpuPct) });
  return rows;
}

///////////////////
// Sub-components //
///////////////////

/** One "Label value" line in the hover breakdown. */
function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[11px] leading-snug text-muted-foreground">
      <span className="text-muted-foreground/60">{label} </span>
      {value}
    </p>
  );
}

////////////////
// Component  //
////////////////

/**
 * Live machine resource usage as a horizontal row of small "label over a thin
 * progress bar" cells (RAM / Swap / CPU, plus GPU where the OS reports it). RAM
 * is pressure-based — it tracks real memory pressure, not raw free/total — so it
 * answers "why is my laptop slow." Bars ramp grey → amber → red as pressure
 * climbs. Hovering opens the byte-level breakdown. Shows a loading skeleton
 * until the first sample lands. The `header` variant renders compact for the top
 * header.
 */
export function SystemMetricsIndicator({
  variant = 'panel',
}: { variant?: MetricsVariant } = {}) {
  useSystemStatsSync();
  const metrics = useSystemStats((s) => s.metrics);

  // No sample yet → subtle loading skeleton (dim labels + pulsing bars).
  if (!metrics) {
    return (
      <div className={CONTAINER_CLASS[variant]}>
        {LOADING_LABELS.map((label) => (
          <div key={label} className={METER_CLASS[variant]}>
            <span className="truncate text-[11px] text-muted-foreground/50">{label}</span>
            <div className={cn('animate-pulse rounded-full bg-white/10', BAR_CLASS[variant] || 'h-1')} />
          </div>
        ))}
      </div>
    );
  }

  const rows = toRows(metrics);

  const meters = (
    <div className={cn(CONTAINER_CLASS[variant], 'cursor-help')}>
      {rows.map((r) => (
        <div key={r.label} className={METER_CLASS[variant]} title={`${r.label} · ${r.pct}%`}>
          <div className="flex items-baseline gap-1 text-[11px] text-muted-foreground">
            <span className="truncate">{r.label}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="shrink-0 tabular-nums">{r.pct}%</span>
          </div>
          <Bar pct={r.pct} fill={severityFill(r.pct)} className={BAR_CLASS[variant]} />
        </div>
      ))}
    </div>
  );

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>{meters}</HoverCardTrigger>
      <HoverCardContent
        side={variant === 'header' ? 'bottom' : 'top'}
        align={variant === 'header' ? 'start' : 'end'}
        className="w-64 p-3"
      >
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-foreground">System resources</p>
          <DetailLine
            label="Memory"
            value={`${formatGb(metrics.ramUsedBytes)} / ${formatGb(metrics.ramTotalBytes)} used · ${Math.round(
              metrics.ramPct,
            )}%`}
          />
          {metrics.swapPct !== null && (
            <DetailLine
              label="Swap"
              value={`${formatGb(metrics.swapUsedBytes)} · ${Math.round(metrics.swapPct)}%`}
            />
          )}
          <DetailLine label="CPU" value={`${Math.round(metrics.cpuPct)}%`} />
          {metrics.gpuPct !== null && (
            <DetailLine label="GPU" value={`${Math.round(metrics.gpuPct)}%`} />
          )}
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            Memory shows pressure (reclaimable cache counted as free), so it reflects real slowness.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
