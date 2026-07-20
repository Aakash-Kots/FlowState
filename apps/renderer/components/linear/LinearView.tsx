'use client';

import { useEffect } from 'react';
import { Loader2, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { LocalModelState } from '@flowstate/shared';
import { useOnboarding } from '@/lib/onboarding';
import {
  refreshIssues,
  refreshLinkedWorktrees,
  refreshMyWork,
  setCreateTicketOpen,
  shouldRunSemantic,
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
  const searchQuery = useLinear((s) => s.searchQuery);
  const semanticSearching = useLinear((s) => s.semanticSearching);
  const modelStatus = useLinear((s) => s.modelStatus);

  // A prominent overlay while the model runs a natural-language search — or, if
  // the query is semantic and the model is still downloading/loading, while it
  // prepares. Literal/identifier searches never show it.
  const preparing =
    modelStatus?.state === LocalModelState.Downloading || modelStatus?.state === LocalModelState.Loading;
  const wantsSemantic = shouldRunSemantic(searchQuery);
  const showOverlay = semanticSearching || (preparing && wantsSemantic);
  const overlayLabel =
    preparing && wantsSemantic
      ? modelStatus?.state === LocalModelState.Downloading
        ? `Preparing smart search… ${Math.round((modelStatus.downloadProgress ?? 0) * 100)}%`
        : 'Loading the model…'
      : 'Searching by meaning…';

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
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Full-view loading state while semantic search runs / the model prepares. */}
      {showOverlay && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
          <div className="relative">
            <Sparkles className="size-7 text-primary" />
            <Loader2 className="absolute -right-2 -top-2 size-4 animate-spin text-primary" />
          </div>
          <p className="text-sm font-medium text-neutral-200">{overlayLabel}</p>
          <p className="max-w-xs text-center text-xs text-muted-foreground">
            Ranking tickets by meaning on-device — the first run downloads the model once.
          </p>
        </div>
      )}

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
