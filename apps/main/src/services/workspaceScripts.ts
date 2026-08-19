/**
 * Workspace script orchestration — the Setup → Run sequence for a worktree's
 * two default terminals. `startWorkspaceScripts` runs the project's Setup script
 * (tracking completion) and, only if it succeeds, auto-starts the Run script in
 * the background — so opening the Run tab mid-install can no longer run `bun run
 * dev` against a half-installed tree. Each script's `enabled` flag gates only
 * that auto-run: a disabled script keeps its command (the tab still shows it)
 * but never fires on its own.
 *
 * It is idempotent: a live script is never restarted (the pty's `injected`
 * guard), and the Setup → Run wiring is registered once per Setup tab, so
 * calling it from both worktree creation and every terminal-panel mount is safe.
 * That listener re-resolves the workspace at fire time rather than closing over
 * a command, so editing or disabling the Run script takes effect immediately.
 *
 * `restartWorkspaceScript` / `stopWorkspaceScript` back the script tab's Restart
 * and Stop buttons. Both are workspace-scoped process control, unlike the
 * project-scoped command and `enabled` flag, which every worktree shares.
 */
import { TerminalKind, type ProjectScriptKind, type TerminalTab } from '@flowstate/shared';
import {
  ensureDefaults,
  getProject,
  getWorkspace,
  listTerminalTabs,
  listWorkspacesByProject,
} from '../store';
import { terminalService } from './terminal';

///////////
// Types //
///////////

/** One resolved script slot: its tab, the command to run, and its auto-run flag. */
type ResolvedScript = { tab: TerminalTab; command: string | null; enabled: boolean };

type ResolvedScripts = {
  cwd: string;
  setup: ResolvedScript | null;
  run: ResolvedScript | null;
};

/////////////
// Helpers //
/////////////

/** Setup tab ids whose completion is already wired to start Run — dedup guard. */
const wiredSetupTabs = new Set<string>();

/** Resolve the workspace's Setup/Run slots + working directory, or null if absent. */
function resolveScripts(workspaceId: string): ResolvedScripts | null {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;
  const project = ws.projectId ? getProject(ws.projectId) : null;
  const tabs = ensureDefaults(workspaceId, project);

  const slot = (kind: ProjectScriptKind): ResolvedScript | null => {
    const tab = tabs.find((t) => t.kind === kind);
    if (!tab) return null;
    const setup = kind === TerminalKind.Setup;
    return {
      tab,
      command: tab.command,
      // No project (a bare worktree) means there is nothing to auto-run anyway.
      enabled: setup
        ? (project?.setupScriptEnabled ?? false)
        : (project?.runScriptEnabled ?? false),
    };
  };

  return { cwd: ws.worktreePath, setup: slot(TerminalKind.Setup), run: slot(TerminalKind.Run) };
}

/** The workspace's slot for one script kind, or null if the workspace is gone. */
function resolveSlot(
  workspaceId: string,
  kind: ProjectScriptKind,
): { cwd: string; slot: ResolvedScript | null } | null {
  const scripts = resolveScripts(workspaceId);
  if (!scripts) return null;
  return { cwd: scripts.cwd, slot: kind === TerminalKind.Setup ? scripts.setup : scripts.run };
}

/** Start the Run script if it is set and enabled. Re-resolves, so it sees edits. */
function startRun(workspaceId: string): void {
  const resolved = resolveSlot(workspaceId, TerminalKind.Run);
  if (!resolved?.slot?.command || !resolved.slot.enabled) return;
  terminalService.runScript(resolved.slot.tab.id, resolved.slot.command, { cwd: resolved.cwd });
}

/**
 * Register the Setup → Run chain once per Setup tab. The completion bus outlives
 * the pty, so this single listener still fires if Setup is later re-run or
 * respawned; it re-resolves the Run script at fire time so an edited or disabled
 * Run command is honoured without an app restart.
 */
function wireSetupToRun(workspaceId: string, setupTabId: string): void {
  if (wiredSetupTabs.has(setupTabId)) return;
  wiredSetupTabs.add(setupTabId);
  terminalService.onComplete(setupTabId, (code) => {
    if (code === 0) startRun(workspaceId);
  });
}

//////////////////////
// Primary behavior //
//////////////////////

/**
 * Start the workspace's Setup script (if set and enabled); when it finishes
 * successfully, start the Run script. With no Setup step to wait for, the Run
 * script starts immediately. Safe to call repeatedly — a running script is a
 * no-op reattach.
 */
export function startWorkspaceScripts(workspaceId: string): void {
  const scripts = resolveScripts(workspaceId);
  if (!scripts) return;
  const { cwd, setup } = scripts;

  const runsSetup = Boolean(setup?.command) && Boolean(setup?.enabled);
  if (runsSetup && setup?.command) {
    terminalService.runScript(setup.tab.id, setup.command, { cwd, trackCompletion: true });
  }
  // Wire whenever a Setup tab exists — even while disabled — so re-enabling it
  // later still chains Run. Registered after `runScript`, which clears the stale
  // completion, so `onComplete`'s immediate-fire can't replay an old exit code.
  if (setup) wireSetupToRun(workspaceId, setup.tab.id);
  if (!runsSetup) startRun(workspaceId);
}

/**
 * Kill the script's pty (and its whole process tree) and run its current command
 * afresh — the tab's Restart button. Deliberately ignores `enabled`: an explicit
 * user action beats the auto-run flag. Killing rather than re-typing is what
 * makes this work while a dev server holds the pty's foreground.
 */
export function restartWorkspaceScript(workspaceId: string, kind: ProjectScriptKind): void {
  const resolved = resolveSlot(workspaceId, kind);
  if (!resolved?.slot?.command) return;
  terminalService.kill(resolved.slot.tab.id);
  terminalService.runScript(resolved.slot.tab.id, resolved.slot.command, {
    cwd: resolved.cwd,
    trackCompletion: kind === TerminalKind.Setup,
  });
}

/** Kill the script's pty in this workspace — the tab's Stop button. */
export function stopWorkspaceScript(workspaceId: string, kind: ProjectScriptKind): void {
  const resolved = resolveSlot(workspaceId, kind);
  if (!resolved?.slot) return;
  terminalService.kill(resolved.slot.tab.id);
}

/**
 * Reap a cleared script's pty across every active worktree of the project.
 * Without this, clearing a command swaps each tab back to its setup form while
 * the old dev server keeps running with no UI left to stop it.
 */
export function killProjectScriptPtys(projectId: string, kind: ProjectScriptKind): void {
  for (const ws of listWorkspacesByProject(projectId)) {
    const tab = listTerminalTabs(ws.id).find((t) => t.kind === kind);
    if (tab) terminalService.kill(tab.id);
  }
}

/** Forget a torn-down workspace's Setup→Run wiring so the guard set stays bounded. */
export function forgetWorkspaceScripts(workspaceId: string): void {
  for (const tab of listTerminalTabs(workspaceId)) wiredSetupTabs.delete(tab.id);
}
