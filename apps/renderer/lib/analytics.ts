'use client';

import { useEffect, useState } from 'react';
import {
  AnalyticsRange,
  type AnalyticsSummary,
  type GithubContributionCalendar,
} from '@flowstate/shared';
import { trpc } from './trpc';

///////////
// Types //
///////////

/** The async state of the analytics summary fetch for the selected range. */
type AnalyticsQuery = {
  data: AnalyticsSummary | null;
  loading: boolean;
  error: boolean;
};

/** The async state of the GitHub contribution-calendar fetch. */
type ContributionsQuery = {
  data: GithubContributionCalendar | null;
  loading: boolean;
  error: boolean;
};

///////////////
// Constants //
///////////////

/** The range toggle's options, in display order. */
export const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: AnalyticsRange.Last7Days, label: '7d' },
  { value: AnalyticsRange.Last30Days, label: '30d' },
  { value: AnalyticsRange.All, label: 'All' },
];

/////////////
// Helpers //
/////////////

/** "$12.40", "$0.83", "$1.2k" — API-equivalent spend. */
export function formatUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

/** 1234 → "1.2k", 1_500_000 → "1.5M", 42 → "42". */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
}

/** "42%" from a 0–1 ratio; guards divide-by-zero to "0%". */
export function formatPct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

/** "Jul 14" from a `YYYY-MM-DD` day key (for chart axes). */
export function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric' });
}

//////////
// Hook //
//////////

/**
 * Fetch the analytics summary for `range`, re-fetching whenever it changes. Uses
 * the vanilla tRPC client (this app has no React Query) with local async state.
 */
export function useAnalyticsSummary(range: AnalyticsRange): AnalyticsQuery {
  const [state, setState] = useState<AnalyticsQuery>({ data: null, loading: true, error: false });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ data: prev.data, loading: true, error: false }));
    trpc()
      .analytics.summary.query({ range })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  return state;
}

/**
 * Fetch the linked GitHub account's contribution calendar once on mount (the
 * fixed trailing-year window). Same vanilla-client shape as `useAnalyticsSummary`.
 * Only call this when GitHub is connected.
 */
export function useGithubContributions(): ContributionsQuery {
  const [state, setState] = useState<ContributionsQuery>({ data: null, loading: true, error: false });

  useEffect(() => {
    let cancelled = false;
    trpc()
      .github.contributionGraph.query()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
