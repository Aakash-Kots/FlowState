'use client';

import { useEffect, useRef, useState } from 'react';
import { FileCode, Plus, X } from 'lucide-react';
import { ClaudeSessionState, MAX_TABS_PER_WORKSPACE, TabKind, type Tab } from '@flowstate/shared';
import { ConnStatus } from '@/lib/enums/connection';
import { TabProvider, useChat } from '@/lib/chat';
import { useFileTabDirty } from '@/lib/fileTabs';
import { useTabState, useTabUnread } from '@/lib/tabStates';
import { closeTab, openTab, selectTab, useWorkspace } from '@/lib/workspace';
import { ChatWorkspace } from '../chat/ChatWorkspace';
import { CloseTabConfirmDialog } from './CloseTabConfirmDialog';
import { FileEditor } from './FileEditor';
import { SkillsPanel } from '../skills/SkillsPanel';
import { StateIndicator } from '../ui/StateIndicator';
import { StatusPill } from '../ui/StatusPill';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

///////////////
// Constants //
///////////////

const STATE_PILL: Record<ClaudeSessionState, { status: ConnStatus; label: string }> = {
  [ClaudeSessionState.Idle]: { status: ConnStatus.Idle, label: 'Ready' },
  [ClaudeSessionState.Running]: { status: ConnStatus.Pending, label: 'Working…' },
  [ClaudeSessionState.Waiting]: { status: ConnStatus.Pending, label: 'Needs input' },
  [ClaudeSessionState.Error]: { status: ConnStatus.Error, label: 'Error' },
};

///////////////////
// Sub-components //
///////////////////

/** Live status pill + model for the active tab, shown at the right of the bar. */
function ActiveTabStatus() {
  const sessionState = useChat((s) => s.sessionState);
  const model = useChat((s) => s.model);
  const pill = STATE_PILL[sessionState];
  return (
    <div className="flex items-center gap-3">
      {model && <span className="hidden text-xs text-muted-foreground md:inline">{model}</span>}
      <StatusPill status={pill.status} label={pill.label} />
    </div>
  );
}

/** One tab in the strip: its title plus a close button (hidden for a lone tab). */
function TabTrigger({ tab, canClose }: { tab: Tab; canClose: boolean }) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  const isFile = tab.kind === TabKind.File;
  const state = useTabState(tab.id);
  const unread = useTabUnread(tab.id);
  const dirty = useFileTabDirty(tab.id);

  // Only surface the tooltip when the title is actually clipped by `truncate`.
  // Re-measured when the title or the tab strip's width changes.
  useEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const measure = () => setTruncated(el.scrollWidth > el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tab.title]);

  const trigger = (
    <TabsTrigger value={tab.id} className="group/tab max-w-40 gap-1.5 pr-1.5">
      {isFile ? (
        <FileCode className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <StateIndicator state={state} unread={unread} />
      )}
      <span ref={labelRef} className="truncate">
        {tab.title}
      </span>
      {isFile && dirty && (
        <span
          aria-label="Unsaved changes"
          className="size-1.5 shrink-0 rounded-full bg-foreground/70"
        />
      )}
      {canClose && (
        <span
          role="button"
          tabIndex={-1}
          aria-label="Close tab"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void closeTab(tab.id);
          }}
          className="rounded p-0.5 text-muted-foreground opacity-60 transition-colors hover:bg-accent hover:text-foreground group-hover/tab:opacity-100"
        >
          <X className="size-3" />
        </span>
      )}
    </TabsTrigger>
  );

  if (!truncated) return trigger;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="bottom">{tab.title}</TooltipContent>
    </Tooltip>
  );
}

/** The "+" control that opens a new tab, disabled once the tab cap is hit. */
function NewTabButton({ disabled }: { disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={() => void openTab()}
      disabled={disabled}
      title={disabled ? `Up to ${MAX_TABS_PER_WORKSPACE} tabs` : 'New tab'}
      className="ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Plus className="size-4" />
    </button>
  );
}

/**
 * The tabbed agent workspace: a strip of Claude chat tabs (up to
 * MAX_TABS_PER_WORKSPACE) over the active tab's session. Only the active tab's
 * ChatWorkspace is mounted; each tab's chat store persists across switches.
 */
export function WorkspaceTabs() {
  const tabs = useWorkspace((s) => s.tabs);
  const activeTabId = useWorkspace((s) => s.activeTabId);

  if (!activeTabId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isFileTab = activeTab?.kind === TabKind.File;
  const chatCount = tabs.filter((t) => t.kind === TabKind.Chat).length;

  return (
    <div className="flex min-h-0 flex-1">
      <Tabs
        value={activeTabId}
        onValueChange={selectTab}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div className="flex items-center border-b border-border bg-secondary px-3 py-1.5">
          <TooltipProvider delayDuration={300}>
            <TabsList className="h-8 gap-1 bg-transparent p-0 text-muted-foreground">
              {tabs.map((tab) => (
                <TabTrigger
                  key={tab.id}
                  tab={tab}
                  canClose={tab.kind === TabKind.File || chatCount > 1}
                />
              ))}
            </TabsList>
          </TooltipProvider>
          <NewTabButton disabled={chatCount >= MAX_TABS_PER_WORKSPACE} />
          {!isFileTab && (
            <div className="ml-auto flex items-center pl-3">
              <TabProvider tabId={activeTabId}>
                <ActiveTabStatus />
              </TabProvider>
            </div>
          )}
        </div>
        <TabsContent value={activeTabId} className="mt-0 flex min-h-0 flex-1 flex-col">
          {isFileTab && activeTab ? (
            <FileEditor tab={activeTab} />
          ) : (
            <ChatWorkspace tabId={activeTabId} />
          )}
        </TabsContent>
      </Tabs>
      {/* Rendered for file tabs too, so the file browser persists while you open
          files; the Skills tab gates its chat-only content internally. */}
      <TabProvider tabId={activeTabId}>
        <SkillsPanel />
      </TabProvider>
      <CloseTabConfirmDialog />
    </div>
  );
}
