import type { CreateWorkspaceInput, Workspace } from '@flowstate/shared';

/**
 * WorktreeService — thin wrapper over `git worktree add/list/remove --porcelain`.
 * Milestone 3: create a workspace (worktree + branch) from a Linear ticket,
 * list/remove worktrees, prune stale ones on startup.
 */
export class WorktreeService {
  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    throw new Error(`WorktreeService.create not implemented: ${JSON.stringify(input)}`);
  }

  async list(): Promise<Workspace[]> {
    throw new Error('WorktreeService.list not implemented');
  }
}
