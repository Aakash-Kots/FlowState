'use client';

import { BarChart3 } from 'lucide-react';
import { setAnalyticsOpen, useSettings } from '@/lib/settings';
import { cn } from '../ui/cn';

/**
 * A compact header toggle that opens the full-screen Analytics surface. Sits
 * beside the Spotify button; highlights while the surface is open.
 */
export function AnalyticsButton() {
  const analyticsOpen = useSettings((s) => s.analyticsOpen);

  return (
    <button
      type="button"
      onClick={() => setAnalyticsOpen(!analyticsOpen)}
      title="Analytics"
      aria-pressed={analyticsOpen}
      className={cn(
        'transition-colors hover:text-neutral-200',
        analyticsOpen ? 'text-neutral-100' : 'text-muted-foreground',
      )}
    >
      <BarChart3 className="size-4" />
      <span className="sr-only">Analytics</span>
    </button>
  );
}
