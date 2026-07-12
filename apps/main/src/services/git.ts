/**
 * GitService — wraps the system `git` (via simple-git) per worktree.
 * Milestone 3: status, stage/commit, branch, log, diff, push/pull, plus a
 * chokidar watcher on `.git` for live status updates.
 */
export class GitService {
  constructor(private readonly worktreePath: string) {}

  async status(): Promise<never> {
    throw new Error(`GitService.status not implemented for ${this.worktreePath}`);
  }
}
