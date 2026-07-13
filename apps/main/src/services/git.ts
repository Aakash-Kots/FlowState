/**
 * GitService — wraps the system `git` (via simple-git) per worktree.
 * Milestone 3: status, stage/commit, branch, log, diff, push/pull, plus a
 * chokidar watcher on `.git` for live status updates.
 */
import { simpleGit } from 'simple-git';

export class GitService {
  constructor(private readonly worktreePath: string) {}

  /** True when the worktree has uncommitted changes — guards destructive removal. */
  async isDirty(): Promise<boolean> {
    const status = await simpleGit(this.worktreePath).status();
    return !status.isClean();
  }

  async status(): Promise<never> {
    throw new Error(`GitService.status not implemented for ${this.worktreePath}`);
  }
}
