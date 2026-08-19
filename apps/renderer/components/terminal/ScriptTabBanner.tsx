'use client';

import { useEffect, useState } from 'react';
import { Check, Pencil, RefreshCw, Square, Trash2, TriangleAlert } from 'lucide-react';
import { TerminalKind, type Project, type ProjectScriptKind } from '@flowstate/shared';
import { saveProjectScript } from '@/lib/projects';
import { trpc } from '@/lib/trpc';
import type { ScriptCompletion } from '@/lib/types/terminal';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Input } from '../ui/input';
import { Switch } from '../ui/Switch';
import { cn } from '../ui/cn';

///////////
// Types //
///////////

type ScriptTabBannerProps = {
  project: Project;
  kind: ProjectScriptKind;
  workspaceId: string | null;
  /** Setup-only script completion (the Run script isn't tracked); null otherwise. */
  completion: ScriptCompletion | null;
  /** Called once a restart/stop has landed — the parent must remount the xterm. */
  onRestart: () => void;
};

///////////////
// Constants //
///////////////

const COPY: Record<ProjectScriptKind, { noun: string; confirmTitle: string }> = {
  [TerminalKind.Setup]: { noun: 'setup command', confirmTitle: 'Remove the setup command?' },
  [TerminalKind.Run]: { noun: 'run command', confirmTitle: 'Remove the run command?' },
};

//////////////////
// Primary view //
//////////////////

/**
 * The header bar above a configured Setup/Run terminal: the command it runs plus
 * the controls to manage it. Edit / Clear / the enable toggle change the
 * *project's* script, so they apply to every worktree; Restart / Stop are
 * process control for *this* worktree only. Rendered above the terminal rather
 * than replacing it, so editing never unmounts (and blanks) the live xterm.
 */
export function ScriptTabBanner({
  project,
  kind,
  workspaceId,
  completion,
  onRestart,
}: ScriptTabBannerProps) {
  const setup = kind === TerminalKind.Setup;
  const command = (setup ? project.setupScript : project.runScript) ?? '';
  const enabled = setup ? project.setupScriptEnabled : project.runScriptEnabled;
  const copy = COPY[kind];

  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Set when a save changed the command: the old pty is still running the old
  // one, and the auto-run guard won't re-inject, so a restart is what applies it.
  const [pendingRestart, setPendingRestart] = useState(false);

  // A fresh completion (seq changes) means the Setup script's (re-)run finished.
  // The Run script is never tracked, so it clears its own spinner on mutation.
  useEffect(() => {
    if (setup) setRestarting(false);
  }, [completion?.seq, setup]);

  const save = async () => {
    const value = (draft ?? '').trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await saveProjectScript(project.id, kind, { command: value });
      if (value !== command) setPendingRestart(true);
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await saveProjectScript(project.id, kind, { enabled: next });
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setConfirmClear(false);
    setBusy(true);
    try {
      await saveProjectScript(project.id, kind, { command: null });
    } finally {
      setBusy(false);
    }
  };

  const restart = async () => {
    if (!workspaceId) return;
    setRestarting(true);
    setPendingRestart(false);
    try {
      await trpc().terminal.restartScript.mutate({ workspaceId, kind });
      onRestart();
    } finally {
      // Setup clears this on its next completion; Run has no completion signal.
      if (!setup) setRestarting(false);
    }
  };

  const stop = async () => {
    if (!workspaceId) return;
    setBusy(true);
    try {
      await trpc().terminal.stopScript.mutate({ workspaceId, kind });
      setPendingRestart(false);
      onRestart();
    } finally {
      setBusy(false);
    }
  };

  if (draft !== null) {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-secondary px-3 py-1.5">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') setDraft(null);
          }}
          className="h-7 font-mono text-xs"
        />
        <Button
          className="px-2 py-1 text-xs"
          onClick={() => void save()}
          disabled={!draft.trim() || busy}
        >
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button
          variant="ghost"
          className="px-2 py-1 text-xs"
          onClick={() => setDraft(null)}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border bg-secondary px-3 py-1.5 text-xs">
        <ScriptStatusIcon setup={setup} restarting={restarting} completion={completion} />
        <code
          className={cn(
            'truncate font-mono text-muted-foreground',
            !enabled && 'italic opacity-60',
          )}
          title={command}
        >
          {command}
        </code>
        {!enabled && (
          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Auto-run off
          </span>
        )}
        {pendingRestart && <span className="shrink-0 text-[11px] text-warn">Restart to apply</span>}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Switch
            checked={enabled}
            onChange={(v) => void toggle(v)}
            disabled={busy}
            label={
              enabled
                ? `Stop auto-running the ${copy.noun} in every worktree`
                : `Auto-run the ${copy.noun} in every worktree`
            }
          />
          <BannerButton
            label="Edit"
            title={`Edit the ${copy.noun} (applies to every worktree of this project)`}
            onClick={() => setDraft(command)}
            disabled={busy}
          >
            <Pencil className="size-3.5" />
          </BannerButton>
          <BannerButton
            label="Restart"
            title="Restart in this worktree"
            onClick={() => void restart()}
            disabled={busy || restarting || !workspaceId}
          >
            <RefreshCw className={cn('size-3.5', restarting && 'animate-spin')} />
          </BannerButton>
          <BannerButton
            label="Stop"
            title="Stop in this worktree"
            onClick={() => void stop()}
            disabled={busy || !workspaceId}
          >
            <Square className="size-3.5" />
          </BannerButton>
          <BannerButton
            label="Clear"
            title={`Remove the ${copy.noun} from this project`}
            onClick={() => setConfirmClear(true)}
            disabled={busy}
            destructive
          >
            <Trash2 className="size-3.5" />
          </BannerButton>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={copy.confirmTitle}
        description={`This removes the ${copy.noun} from ${project.name} and stops it in every worktree of the project.`}
        confirmLabel="Remove"
        onConfirm={() => void clear()}
        destructive
      />
    </>
  );
}

///////////////////
// Sub-components //
///////////////////

/** The Setup script's finished/failed dot (the Run script reports no exit code). */
function ScriptStatusIcon({
  setup,
  restarting,
  completion,
}: {
  setup: boolean;
  restarting: boolean;
  completion: ScriptCompletion | null;
}) {
  if (restarting)
    return <RefreshCw className="size-3 shrink-0 animate-spin text-muted-foreground" />;
  if (!setup || !completion) return null;
  return completion.exitCode === 0 ? (
    <Check className="size-3 shrink-0 text-success" aria-label="Setup script finished" />
  ) : (
    <span className="shrink-0" title={`Setup script failed (exit ${completion.exitCode})`}>
      <TriangleAlert className="size-3 text-danger" aria-label="Setup script failed" />
    </span>
  );
}

/** One square icon action in the banner's right-hand cluster. */
function BannerButton({
  label,
  title,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
        destructive && 'hover:text-danger',
      )}
    >
      {children}
    </button>
  );
}
