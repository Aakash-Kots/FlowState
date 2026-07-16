import { cn } from './cn';

///////////////
// Constants //
///////////////

/** Utilization thresholds where a meter bar shifts from calm grey → amber → red. */
export const METER_WARN_PCT = 65;
export const METER_DANGER_PCT = 85;

/////////////
// Helpers //
/////////////

/** Bar fill class by headroom: calm grey when low, amber mid, red high. */
export function severityFill(pct: number): string {
  if (pct >= METER_DANGER_PCT) return 'bg-danger';
  if (pct >= METER_WARN_PCT) return 'bg-warn';
  return 'bg-muted-foreground';
}

////////////////
// Component  //
////////////////

/** A subtle progress bar, shared by the Claude-usage and system-metrics meters. */
export function Bar({
  pct,
  className,
  fill = 'bg-muted-foreground',
}: {
  pct: number;
  className?: string;
  fill?: string;
}) {
  return (
    <div className={cn('h-1 overflow-hidden rounded-full bg-white/10', className)}>
      <div
        className={cn('h-full rounded-full', fill)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}
