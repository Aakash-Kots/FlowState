'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  MAX_TERMINALS_PER_WORKSPACE,
  TerminalKind,
  type Project,
  type TerminalTab,
} from '@flowstate/shared';
import {
  closeTerminal,
  loadTerminals,
  openTerminal,
  selectTerminal,
  useTerminals,
} from '@/lib/terminals';
import { useProjects } from '@/lib/projects';
import { useWorkspace } from '@/lib/workspace';
import { trpc } from '@/lib/trpc';
import type { ScriptCompletion } from '@/lib/types/terminal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScriptSetupTab } from './ScriptSetupTab';
import { ScriptTabBanner } from './ScriptTabBanner';
import { WorkspaceTerminal } from './WorkspaceTerminal';

/////////////
// Helpers //
/////////////

/**
 * Subscribe to a terminal's script-completion signal (the hidden exit-code
 * sentinel). Emits immediately with the last known code if the script already
 * finished; re-runs bump `seq`. Null while nothing has completed (or no id).
 */
function useScriptCompletion(id: string | null): ScriptCompletion | null {
  const [completion, setCompletion] = useState<ScriptCompletion | null>(null);
  useEffect(() => {
    setCompletion(null);
    if (!id) return;
    let seq = 0;
    const sub = trpc().terminal.onComplete.subscribe(
      { id },
      {
        onData: (exitCode: number) => setCompletion({ exitCode, seq: (seq += 1) }),
        onError: () => {},
      },
    );
    return () => sub.unsubscribe();
  }, [id]);
  return completion;
}

///////////////////
// Sub-components //
///////////////////

/** One tab in the strip: its title, a Setup/Run status dot, and a close button (shells only). */
function TerminalTabTrigger({
  tab,
  completion,
}: {
  tab: TerminalTab;
  completion: ScriptCompletion | null;
}) {
  const canClose = tab.kind === TerminalKind.Shell;
  return (
    <TabsTrigger value={tab.id} className="group/tab max-w-40 gap-1.5 pr-1.5">
      {completion && (
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${
            completion.exitCode === 0 ? 'bg-green-500' : 'bg-destructive'
          }`}
        />
      )}
      <span className="truncate">{tab.title}</span>
      {canClose && (
        <span
          role="button"
          tabIndex={-1}
          aria-label="Close terminal"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void closeTerminal(tab.id);
          }}
          className="rounded p-0.5 text-muted-foreground opacity-60 transition-colors hover:bg-accent hover:text-foreground group-hover/tab:opacity-100"
        >
          <X className="size-3" />
        </span>
      )}
    </TabsTrigger>
  );
}

/** The "+" control that opens a new shell terminal, disabled at the cap. */
function NewTerminalButton({ disabled }: { disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={() => void openTerminal()}
      disabled={disabled}
      title={disabled ? `Up to ${MAX_TERMINALS_PER_WORKSPACE} terminals` : 'New terminal'}
      className="ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Plus className="size-4" />
    </button>
  );
}

/** The body for the active terminal tab: an inline script prompt or the live pty. */
function TerminalBody({
  tab,
  cwd,
  project,
  workspaceId,
  completion,
}: {
  tab: TerminalTab;
  cwd: string | null;
  project: Project | null;
  workspaceId: string | null;
  /** Setup-script completion — only passed for the Setup tab. */
  completion: ScriptCompletion | null;
}) {
  // Bumped by the banner's Restart/Stop: killing the pty completes the router's
  // onData observable, and WorkspaceTerminal only re-subscribes when its key
  // changes — without this the terminal would stay dead after a restart.
  const [restarts, setRestarts] = useState(0);

  const scriptKind =
    tab.kind === TerminalKind.Setup || tab.kind === TerminalKind.Run ? tab.kind : null;

  // An unconfigured Setup/Run tab prompts for the project script and must never
  // spawn a pty — otherwise a plain shell would orphan itself under the tab id
  // and block the real command from running once it's set.
  if (scriptKind && !tab.command) {
    if (!project) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-secondary text-sm text-muted-foreground">
          Loading…
        </div>
      );
    }
    return <ScriptSetupTab project={project} kind={scriptKind} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {scriptKind && project && (
        <ScriptTabBanner
          project={project}
          kind={scriptKind}
          workspaceId={workspaceId}
          completion={completion}
          onRestart={() => setRestarts((n) => n + 1)}
        />
      )}
      <div className="min-h-0 flex-1">
        <WorkspaceTerminal key={`${tab.id}:${restarts}`} terminalId={tab.id} cwd={cwd} />
      </div>
    </div>
  );
}

/**
 * The worktree's terminals: a strip of the two project-scoped default tabs
 * (Setup + Run) plus ad-hoc shells, over the active terminal. Only the active
 * tab's terminal is mounted; the ptys persist in the main process across
 * switches, so a running dev server survives leaving and returning to this view.
 */
export function TerminalTabs() {
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const cwd = useWorkspace((s) => s.cwd);
  const terminalTabs = useTerminals((s) => s.terminalTabs);
  const activeTerminalTabId = useTerminals((s) => s.activeTerminalTabId);
  // The active worktree's project — used to configure Setup/Run scripts inline.
  const project = useProjects((s) => {
    const ws = Object.values(s.worktrees)
      .flat()
      .find((w) => w.id === workspaceId);
    return (ws?.projectId ? s.projects.find((p) => p.id === ws.projectId) : null) ?? null;
  });

  useEffect(() => {
    void loadTerminals(workspaceId);
  }, [workspaceId]);

  // Track the configured Setup script's completion for its tab dot + banner.
  const setupTab = terminalTabs.find((t) => t.kind === TerminalKind.Setup && t.command);
  const setupCompletion = useScriptCompletion(setupTab?.id ?? null);

  const shellCount = terminalTabs.filter((t) => t.kind === TerminalKind.Shell).length;
  const activeTab = terminalTabs.find((t) => t.id === activeTerminalTabId);

  if (!activeTerminalTabId || !activeTab) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <Tabs
      value={activeTerminalTabId}
      onValueChange={selectTerminal}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex items-center border-b border-border bg-secondary px-3 py-1.5">
        <TabsList className="h-8 gap-1 bg-transparent p-0 text-muted-foreground">
          {terminalTabs.map((tab) => (
            <TerminalTabTrigger
              key={tab.id}
              tab={tab}
              completion={tab.id === setupTab?.id ? setupCompletion : null}
            />
          ))}
        </TabsList>
        <NewTerminalButton disabled={shellCount >= MAX_TERMINALS_PER_WORKSPACE} />
      </div>
      <TabsContent value={activeTerminalTabId} className="mt-0 flex min-h-0 flex-1 flex-col">
        <TerminalBody
          tab={activeTab}
          cwd={cwd}
          project={project}
          workspaceId={workspaceId}
          completion={activeTab.id === setupTab?.id ? setupCompletion : null}
        />
      </TabsContent>
    </Tabs>
  );
}
