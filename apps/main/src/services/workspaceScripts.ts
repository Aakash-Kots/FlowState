/**
 * Workspace script orchestration — the Setup → Run sequence for a worktree's
 * two default terminals. `startWorkspaceScripts` runs the project's Setup script
 * (tracking completion) and, only if it succeeds, auto-starts the Run script in
 * the background — so opening the Run tab mid-install can no longer run `bun run
 * dev` against a half-installed tree. `rerunSetupScript` backs the "Re-run setup
 * script" button.
 *
 * It is idempotent: a live script is never restarted (the pty's `injected`
 * guard), and the Setup → Run wiring is registered once per Setup tab, so
 * calling it from both worktree creation and every terminal-panel mount is safe.
 */
import { TerminalKind } from '@flowstate/shared';
import { ensureDefaults, getProject, getWorkspace } from '../store';
import { terminalService } from './terminal';

/////////////
// Helpers //
/////////////

/** Setup tab ids whose completion is already wired to start Run — dedup guard. */
const wiredSetupTabs = new Set<string>();

/** Resolve the workspace's Setup/Run tabs + working directory, or null if absent. */
function resolveScripts(workspaceId: string) {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;
  const project = ws.projectId ? getProject(ws.projectId) : null;
  const tabs = ensureDefaults(workspaceId, project);
  return {
    cwd: ws.worktreePath,
    setup: tabs.find((t) => t.kind === TerminalKind.Setup) ?? null,
    run: tabs.find((t) => t.kind === TerminalKind.Run) ?? null,
  };
}

//////////////////////
// Primary behavior //
//////////////////////

/**
 * Start the workspace's Setup script (if any); when it finishes successfully,
 * start the Run script. With no Setup script, the Run script starts immediately.
 * Safe to call repeatedly — a running script is a no-op reattach.
 */
export function startWorkspaceScripts(workspaceId: string): void {
  const scripts = resolveScripts(workspaceId);
  if (!scripts) return;
  const { cwd, setup, run } = scripts;

  if (setup?.command) {
    terminalService.runScript(setup.id, setup.command, { cwd, trackCompletion: true });
    // Wire Setup → Run once. The completion bus outlives the pty, so this single
    // listener still fires if Setup is later re-run or respawned.
    if (run?.command && !wiredSetupTabs.has(setup.id)) {
      wiredSetupTabs.add(setup.id);
      terminalService.onComplete(setup.id, (code) => {
        if (code === 0) terminalService.runScript(run.id, run.command!, { cwd });
      });
    }
    return;
  }

  // No Setup step — the Run script has nothing to wait for.
  if (run?.command) terminalService.runScript(run.id, run.command, { cwd });
}

/** Re-run the workspace's Setup script in place (the "Re-run setup script" button). */
export function rerunSetupScript(workspaceId: string): void {
  const scripts = resolveScripts(workspaceId);
  if (!scripts?.setup?.command) return;
  terminalService.rerunScript(scripts.setup.id, scripts.setup.command, {
    cwd: scripts.cwd,
    trackCompletion: true,
  });
}
