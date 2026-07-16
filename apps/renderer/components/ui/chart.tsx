'use client';

import * as React from 'react';
import { ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { cn } from './cn';

///////////
// Types //
///////////

/** Per-series display metadata: a human label and an optional CSS color. The
 * color is exposed to Recharts children as a `--color-<key>` CSS variable. */
export type ChartSeries = { label: string; color?: string };
export type ChartConfig = Record<string, ChartSeries>;

/** One entry Recharts hands to a custom tooltip, loosely typed to avoid coupling
 * to Recharts' internal generics. */
type TooltipItem = {
  name?: string | number;
  value?: string | number;
  dataKey?: string | number;
  color?: string;
  payload?: Record<string, unknown>;
};

/////////////
// Context //
/////////////

const ChartContext = React.createContext<ChartConfig>({});

/** The nearest {@link ChartContainer}'s config (labels + colors). */
export function useChartConfig(): ChartConfig {
  return React.useContext(ChartContext);
}

////////////////
// Components  //
////////////////

/**
 * Themed wrapper around Recharts' `ResponsiveContainer`. Publishes each series'
 * color as a `--color-<key>` CSS variable (so children reference
 * `var(--color-foo)`) and provides the config via context to the tooltip.
 * The parent must have a fixed height — pass one through `className`.
 */
export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig;
  className?: string;
  children: React.ReactElement;
}) {
  const style = Object.fromEntries(
    Object.entries(config)
      .filter(([, series]) => series.color)
      .map(([key, series]) => [`--color-${key}`, series.color]),
  ) as React.CSSProperties;

  return (
    <ChartContext.Provider value={config}>
      <div className={cn('w-full', className)} style={style}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

/** Recharts' `Tooltip`, re-exported so callers pass `<ChartTooltipContent />` as
 * its `content`. */
export const ChartTooltip = RechartsTooltip;

/** A compact, on-brand tooltip body. Recharts injects `active`/`payload`/`label`. */
export function ChartTooltipContent({
  active,
  payload,
  label,
  valueFormatter = (v) => String(v),
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  valueFormatter?: (value: number | string) => string;
}) {
  const config = useChartConfig();
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      {label !== undefined && (
        <div className="mb-1 font-medium text-neutral-100">{String(label)}</div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((item, i) => {
          const key = String(item.dataKey ?? item.name ?? i);
          const seriesLabel = config[key]?.label ?? String(item.name ?? key);
          return (
            <div key={key} className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color ?? 'hsl(var(--muted-foreground))' }}
              />
              <span className="text-muted-foreground">{seriesLabel}</span>
              <span className="ml-auto tabular-nums text-neutral-100">
                {item.value === undefined ? '—' : valueFormatter(item.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
