/**
 * Workspace creation — the orchestration behind `worktree.create`, extracted so
 * both the tRPC router and the on-device Gemma tool loop can spin up a Workspace
 * the same way: cut a git worktree on its own branch, link the project's `.env*`
 * files, persist the workspace + its first Claude tab, start the setup/run
 * scripts, and seed the first Claude turn (with the linked Linear ticket's
 * context when present).
 *
 * Callers get a typed `WorkspaceCreateError` so each can render the failure in
 * its own idiom (the router maps `reason` to a tRPC code; the tool loop turns it
 * into a tool-result summary the model can react to).
 */
import { randomUUID } from 'node:crypto';
import {
  ClaudeSessionState,
  DEFAULT_TAB_TITLE,
  PermissionMode,
  TabKind,
  UNTITLED_WORKSPACE_NAME,
  type CreateWorktreeInput,
  type LinearIssue,
  type LinearIssueRef,
  type Tab,
  type Workspace,
} from '@flowstate/shared';
import { getProject, upsertTab, upsertWorkspace } from '../store';
import { randomBranchName } from '../lib/branch-names';
import { claudeService } from './claude';
import { githubService } from './github';
import { linearService } from './linear';
import { fileLinkService } from './links';
import { startWorkspaceScripts } from './workspaceScripts';
import { worktreeService } from './worktree';

///////////
// Types //
///////////

/** Why workspace creation failed, so callers can pick an appropriate surface
 * (tRPC code / tool-result message) without string-matching. */
export type WorkspaceCreateFailure = 'not-found' | 'precondition' | 'internal';

/** Thrown by `createWorkspace`; `reason` mirrors the router's original codes. */
export class WorkspaceCreateError extends Error {
  constructor(
    readonly reason: WorkspaceCreateFailure,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceCreateError';
  }
}

///////////////
// Constants //
///////////////

/** Linear's priority scale (0 none, 1 urgent, 2 high, 3 medium, 4 low). */
const PRIORITY_LABELS: Record<number, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

/////////////
// Helpers //
/////////////

/** Build a fresh Idle chat tab at the given position. */
export function makeTab(
  workspaceId: string,
  title: string,
  position: number,
  kind: TabKind = TabKind.Chat,
  filePath: string | null = null,
): Tab {
  return {
    id: randomUUID(),
    workspaceId,
    title,
    kind,
    filePath,
    claudeState: ClaudeSessionState.Idle,
    claudeSessionId: null,
    model: null,
    effort: null,
    permissionMode: PermissionMode.Default,
    position,
    createdAt: new Date().toISOString(),
  };
}

/**
 * A plain-text briefing on the linked Linear ticket for Claude's first turn.
 * Prefers the full issue (status/assignee/priority/description) when the fetch
 * succeeded, falling back to the small ref we always have.
 */
function buildTicketContext(ref: LinearIssueRef, full: LinearIssue | null): string {
  const lines = [
    `This worktree is linked to Linear ticket ${ref.identifier}: ${ref.title}`,
    `URL: ${ref.url}`,
  ];
  const stateName = full?.state.name ?? ref.stateName;
  if (stateName) lines.push(`Status: ${stateName}`);
  if (full) {
    lines.push(`Priority: ${PRIORITY_LABELS[full.priority] ?? PRIORITY_LABELS[0]}`);
    if (full.assignee) lines.push(`Assignee: ${full.assignee.name}`);
    if (full.description?.trim()) lines.push('', 'Description:', full.description.trim());
  }
  return lines.join('\n');
}

/**
 * Compose the first message sent to a new worktree's Claude session. With a linked
 * ticket we prepend its briefing; with a typed prompt too, the prompt follows the
 * briefing. A ticket but no prompt seeds context only — Claude should read the
 * ticket and wait for instructions rather than start changing code.
 */
async function composeSeed(ref: LinearIssueRef | null | undefined, prompt: string): Promise<string> {
  if (!ref) return prompt;
  const full = await linearService.issue(ref.id).catch(() => null);
  const context = buildTicketContext(ref, full);
  if (prompt) return `${context}\n\n---\n\n${prompt}`;
  return `${context}\n\nFamiliarise yourself with this ticket and wait for my instructions before making any changes.`;
}

//////////////////////
// createWorkspace  //
//////////////////////

/**
 * Create a worktree (branch + linked env) under a project and seed its first
 * Claude tab. Rolls back the orphaned worktree if later setup fails. Throws
 * `WorkspaceCreateError` with a `reason` the caller maps to its own surface.
 */
export async function createWorkspace(
  input: CreateWorktreeInput,
): Promise<{ workspace: Workspace; tab: Tab }> {
  const project = getProject(input.projectId);
  if (!project) throw new WorkspaceCreateError('not-found', 'Project not found.');

  const repoRoot = project.localPath;
  const baseRef = input.baseRef?.trim() || project.worktreeBaseBranch || project.defaultBranch;
  // Branch name: an explicit override (e.g. the user-edited Linear branch), else
  // the linked issue's suggested branch, else a friendly random name that
  // `maybeGenerateTitle` later renames to a slug of the first chat. Made unique
  // so a name collision never fails creation.
  const desiredBranch = input.branch?.trim() || input.linearIssue?.branchName || randomBranchName();
  const branch = await worktreeService.uniqueBranchName(repoRoot, desiredBranch);
  const worktreePath = worktreeService.worktreePathFor(repoRoot, branch);

  // Refresh remote refs so the worktree is cut from the latest base branch, not a
  // stale local one. Best-effort: local-only repos throw here and fall back to
  // the local base ref inside `create`.
  await githubService.fetch(repoRoot).catch(() => {});
  await githubService.syncBaseBranch(repoRoot, baseRef).catch(() => {});

  // 1. Create the worktree + branch.
  try {
    await worktreeService.create({ repoRoot, branch, baseRef, worktreePath });
  } catch (err) {
    throw new WorkspaceCreateError(
      'precondition',
      err instanceof Error ? err.message : 'Failed to create worktree.',
    );
  }

  try {
    // 2. Link the project's .env* files into the fresh checkout (best-effort).
    const envFiles = await fileLinkService.detectEnvFiles(repoRoot);
    await fileLinkService.linkInto(repoRoot, worktreePath, envFiles);

    // 3. Persist the workspace + seed its first Claude tab.
    const workspace = upsertWorkspace({
      id: randomUUID(),
      projectId: project.id,
      name: UNTITLED_WORKSPACE_NAME,
      repoRoot,
      worktreePath,
      branch,
      baseRef,
      linearIssue: input.linearIssue ?? null,
      claudeState: ClaudeSessionState.Idle,
      claudeSessionId: null,
      archivedAt: null,
      createdAt: new Date().toISOString(),
    });
    const tab = upsertTab({
      ...makeTab(workspace.id, DEFAULT_TAB_TITLE, 0),
      // Start the first session in the requested mode (e.g. Plan) — seeded on the
      // tab so ensureSession picks it up before the initial prompt runs.
      ...(input.permissionMode ? { permissionMode: input.permissionMode } : {}),
    });

    // 4. Seed the Setup/Run terminals and run the project's Setup script so
    //    dependencies install the moment the worktree exists.
    startWorkspaceScripts(workspace.id);

    // 5. Kick off the first session with the linked ticket's context (and the
    //    user's prompt, if any) so Claude knows what it's working on.
    const seed = await composeSeed(input.linearIssue, input.initialPrompt?.trim() ?? '');
    const images = input.initialImages ?? [];
    if (seed || images.length) claudeService.send(tab.id, seed, images);

    return { workspace, tab };
  } catch (err) {
    // Roll back the orphaned worktree so a retry with the same branch works.
    await worktreeService.remove({ repoRoot, worktreePath, force: true }).catch(() => {});
    throw new WorkspaceCreateError(
      'internal',
      err instanceof Error ? err.message : 'Failed to set up worktree.',
    );
  }
}
