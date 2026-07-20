'use client';

import { useEffect } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useOnboarding } from '@/lib/onboarding';
import {
  refreshIssues,
  refreshLinkedWorktrees,
  refreshMyWork,
  setCreateTicketOpen,
  useLinear,
  useLinearSync,
} from '@/lib/linear';
import { cn } from '../ui/cn';
import { useSidebar } from '../ui/sidebar';
import { ActiveWorkSection } from './ActiveWorkSection';
import { FilterBar } from './FilterBar';
import { IssueDetail } from './IssueDetail';
import { IssueList } from './IssueList';
import { OpenPrSection } from './OpenPrSection';

/**
 * The Linear command center: a header (＋ New ticket, refresh) over a filter bar,
 * an "Active work" card row, an "Open PRs" list, and the full issue browser
 * (list ⇄ detail). Live sync is owned by `useLinearSync`, mounted here; the
 * sections just read the store. Gated on Linear being connected.
 */
export function LinearView() {
  useLinearSync();

  // Collapse the left sidebar to give the command center room. Mount-only so the
  // user re-opening the sidebar while on this tab isn't fought.
  const { setOpen } = useSidebar();
  useEffect(() => {
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linearConnected = useOnboarding((s) => s.linearConnected);
  const loading = useLinear((s) => s.issuesLoading);
  const error = useLinear((s) => s.issuesError);

  const refresh = () => {
    void refreshIssues();
    void refreshMyWork();
    void refreshLinkedWorktrees();
  };

  if (!linearConnected) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
        Connect Linear from the Connect screen to browse issues here.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-secondary px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Linear
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCreateTicketOpen(true)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" />
            New ticket
          </button>
          <button
            type="button"
            onClick={refresh}
            title="Refresh"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      <FilterBar />
      <ActiveWorkSection />
      <OpenPrSection />

      {/* Browser: issue list ▸ detail */}
      {error ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-danger">
          {error}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <IssueList />
          <IssueDetail />
        </div>
      )}
    </div>
  );
}
