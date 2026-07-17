'use client';

import type {
  CommitDayPoint,
  UsageDayPoint,
  UsageModelStat,
  UsageWorkspaceStat,
} from '@flowstate/shared';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../ui/chart';
import { formatCompact, formatDay, formatUsd } from '@/lib/analytics';

///////////////
// Constants //
///////////////

/** Categorical palette, resolved from the CSS vars added in globals.css. */
const CHART = {
  c1: 'hsl(var(--chart-1))',
  c2: 'hsl(var(--chart-2))',
  c3: 'hsl(var(--chart-3))',
  c4: 'hsl(var(--chart-4))',
  c5: 'hsl(var(--chart-5))',
  c6: 'hsl(var(--chart-6))',
} as const;

/** Rotation used to color categorical bars (model / workspace). */
const BAR_COLORS = [CHART.c1, CHART.c2, CHART.c3, CHART.c4, CHART.c5, CHART.c6];

/** Shared axis styling — dim, hairline, small. */
const AXIS = {
  tick: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
  tickLine: false,
  axisLine: false,
} as const;

const GRID_STROKE = 'hsl(var(--border))';

////////////////
// Components  //
////////////////

/** Claude API-equivalent spend per day (filled area). */
export function SpendAreaChart({ data }: { data: UsageDayPoint[] }) {
  const config: ChartConfig = { costUsd: { label: 'Spend', color: CHART.c1 } };
  return (
    <ChartContainer config={config} className="h-56">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis dataKey="day" tickFormatter={formatDay} {...AXIS} minTickGap={24} />
        <YAxis width={44} tickFormatter={(v: number) => formatUsd(v)} {...AXIS} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={(v) => formatUsd(Number(v))} />} />
        <Area
          type="monotone"
          dataKey="costUsd"
          stroke="var(--color-costUsd)"
          fill="var(--color-costUsd)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/** Token usage per day, stacked by bucket (input / output / cache). */
export function TokensAreaChart({ data }: { data: UsageDayPoint[] }) {
  const config: ChartConfig = {
    inputTokens: { label: 'Input', color: CHART.c2 },
    outputTokens: { label: 'Output', color: CHART.c1 },
    cacheReadTokens: { label: 'Cache read', color: CHART.c4 },
    cacheCreationTokens: { label: 'Cache write', color: CHART.c5 },
  };
  return (
    <ChartContainer config={config} className="h-56">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis dataKey="day" tickFormatter={formatDay} {...AXIS} minTickGap={24} />
        <YAxis width={44} tickFormatter={(v: number) => formatCompact(v)} {...AXIS} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={(v) => formatCompact(Number(v))} />} />
        {Object.keys(config).map((key) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            stackId="tokens"
            stroke={`var(--color-${key})`}
            fill={`var(--color-${key})`}
            fillOpacity={0.2}
            strokeWidth={1.5}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}

/** Turns per day with the erroring share overlaid (stacked bars). */
export function TurnsBarChart({ data }: { data: UsageDayPoint[] }) {
  // Split each day into successful vs erroring turns for a clean stack.
  const rows = data.map((d) => ({ day: d.day, ok: Math.max(0, d.turns - d.errors), errors: d.errors }));
  const config: ChartConfig = {
    ok: { label: 'Turns', color: CHART.c2 },
    errors: { label: 'Errors', color: CHART.c6 },
  };
  return (
    <ChartContainer config={config} className="h-56">
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis dataKey="day" tickFormatter={formatDay} {...AXIS} minTickGap={24} />
        <YAxis width={36} allowDecimals={false} {...AXIS} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={(v) => String(v)} />} />
        <Bar dataKey="ok" stackId="turns" fill="var(--color-ok)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="errors" stackId="turns" fill="var(--color-errors)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

/** Horizontal spend-by-model bars, highest first. */
export function ModelBarChart({ data }: { data: UsageModelStat[] }) {
  const config: ChartConfig = { costUsd: { label: 'Spend' } };
  return (
    <ChartContainer config={config} className="h-56">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
        <XAxis type="number" tickFormatter={(v: number) => formatUsd(v)} {...AXIS} />
        <YAxis type="category" dataKey="model" width={120} {...AXIS} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={(v) => formatUsd(Number(v))} />} />
        <Bar dataKey="costUsd" radius={[0, 3, 3, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Tooltip for the workspace bars — worktree name, its branch + project, spend. */
function WorkspaceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: UsageWorkspaceStat }[];
}) {
  const stat = active ? payload?.[0]?.payload : undefined;
  if (!stat) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      <div className="font-medium text-neutral-100">{stat.name}</div>
      {stat.branch && <div className="text-muted-foreground">Branch: {stat.branch}</div>}
      {stat.project && <div className="text-muted-foreground">Project: {stat.project}</div>}
      <div className="mt-1 tabular-nums text-neutral-100">{formatUsd(stat.costUsd)}</div>
    </div>
  );
}

/** Horizontal spend-by-workspace bars, top spenders first. */
export function WorkspaceBarChart({ data }: { data: UsageWorkspaceStat[] }) {
  const config: ChartConfig = { costUsd: { label: 'Spend' } };
  return (
    <ChartContainer config={config} className="h-64">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
        <XAxis type="number" tickFormatter={(v: number) => formatUsd(v)} {...AXIS} />
        <YAxis type="category" dataKey="name" width={140} {...AXIS} />
        <ChartTooltip content={<WorkspaceTooltip />} />
        <Bar dataKey="costUsd" radius={[0, 3, 3, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Commits per day with insertions/deletions available on hover. */
export function CommitsBarChart({ data }: { data: CommitDayPoint[] }) {
  const config: ChartConfig = { commits: { label: 'Commits', color: CHART.c4 } };
  return (
    <ChartContainer config={config} className="h-56">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis dataKey="day" tickFormatter={formatDay} {...AXIS} minTickGap={24} />
        <YAxis width={36} allowDecimals={false} {...AXIS} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={(v) => String(v)} />} />
        <Bar dataKey="commits" fill="var(--color-commits)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
