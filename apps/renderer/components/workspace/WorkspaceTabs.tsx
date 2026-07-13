'use client';

import { Plus, X } from 'lucide-react';
import { ClaudeSessionState, MAX_TABS_PER_WORKSPACE, type Tab } from '@flowstate/shared';
import { ConnStatus } from '@/lib/enums/connection';
import { TabProvider, useChat } from '@/lib/chat';
import { closeTab, openTab, selectTab, useWorkspace } from '@/lib/workspace';
import { ChatWorkspace } from '../chat/ChatWorkspace';
import { StatusPill } from '../ui/StatusPill';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

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
  return (
    <TabsTrigger value={tab.id} className="group/tab max-w-40 gap-1.5 pr-1.5">
      <span className="truncate">{tab.title}</span>
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
          className="rounded p-0.5 text-muted-foreground opacity-60 transition-colors hover:bg-edge hover:text-foreground group-hover/tab:opacity-100"
        >
          <X className="size-3" />
        </span>
      )}
    </TabsTrigger>
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
      className="ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
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
      <div className="flex min-h-0 flex-1 items-center justify-center bg-base text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <Tabs value={activeTabId} onValueChange={selectTab} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center border-b border-edge bg-surface px-3 py-1.5">
        <TabsList className="h-8 gap-1 bg-transparent p-0 text-muted-foreground">
          {tabs.map((tab) => (
            <TabTrigger key={tab.id} tab={tab} canClose={tabs.length > 1} />
          ))}
        </TabsList>
        <NewTabButton disabled={tabs.length >= MAX_TABS_PER_WORKSPACE} />
        <div className="ml-auto flex items-center pl-3">
          <TabProvider tabId={activeTabId}>
            <ActiveTabStatus />
          </TabProvider>
        </div>
      </div>
      <TabsContent value={activeTabId} className="mt-0 flex min-h-0 flex-1 flex-col">
        <ChatWorkspace tabId={activeTabId} />
      </TabsContent>
    </Tabs>
  );
}
