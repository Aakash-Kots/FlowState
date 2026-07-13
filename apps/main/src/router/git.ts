/**
 * Git control plane for a worktree's changes view. Every procedure is keyed by
 * `workspaceId` (a Workspace = one git worktree); the worktree path is resolved
 * from the store. Local operations go through `GitService`; anything that talks
 * to the remote (fetch/pull/push/PR) goes through `GithubService`, which holds
 * the linked account's token.
 */
import {
  type CreatePrResult,
  type GitDiffStat,
  type GitFileDiff,
  type GitStatus,
  type PrStatus,
  type Workspace,
  commitInputSchema,
  createPrInputSchema,
  gitDiffFileInputSchema,
  gitPathsInputSchema,
  gitWorkspaceInputSchema,
} from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { getProject, getWorkspace } from '../store';
import { GitService } from '../services/git';
import { githubService } from '../services/github';
import { publicProcedure, router } from '../trpc';

/////////////
// Helpers //
/////////////

/** Resolve a workspace to its worktree, or fail with NOT_FOUND. */
function requireWorkspace(workspaceId: string): Workspace {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found.' });
  return ws;
}

/** Wrap a remote git error as a tRPC error so the message reaches the UI. */
function remoteError(err: unknown): TRPCError {
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: err instanceof Error ? err.message : 'Git operation failed.',
  });
}

export const gitRouter = router({
  /** The worktree's uncommitted changes + branch/upstream sync position. */
  status: publicProcedure.input(gitWorkspaceInputSchema).query(({ input }): Promise<GitStatus> => {
    const ws = requireWorkspace(input.workspaceId);
    return new GitService(ws.worktreePath).status();
  }),

  /** Total lines added/removed on this worktree's branch vs its base (for the sidebar badge). */
  diffStat: publicProcedure
    .input(gitWorkspaceInputSchema)
    .query(({ input }): Promise<GitDiffStat> => {
      const ws = requireWorkspace(input.workspaceId);
      const base = ws.baseRef ?? (ws.projectId ? getProject(ws.projectId)?.defaultBranch : null);
      if (!base) return Promise.resolve({ insertions: 0, deletions: 0, filesChanged: 0 });
      return new GitService(ws.worktreePath).diffStat(base);
    }),

  /**
   * The PR opened for this worktree's branch (CI + merge signal), or null if none.
   * Best-effort: any GitHub/remote failure resolves to null so the header degrades
   * gracefully instead of erroring.
   */
  prStatus: publicProcedure
    .input(gitWorkspaceInputSchema)
    .query(async ({ input }): Promise<PrStatus | null> => {
      const ws = requireWorkspace(input.workspaceId);
      try {
        return await githubService.prStatus(ws.worktreePath, ws.branch);
      } catch {
        return null;
      }
    }),

  /** A single file's unified diff (staged or working-tree side). */
  diffFile: publicProcedure
    .input(gitDiffFileInputSchema)
    .query(({ input }): Promise<GitFileDiff> => {
      const ws = requireWorkspace(input.workspaceId);
      return new GitService(ws.worktreePath).diffFile(input.path, input.staged);
    }),

  stage: publicProcedure.input(gitPathsInputSchema).mutation(({ input }) => {
    const ws = requireWorkspace(input.workspaceId);
    return new GitService(ws.worktreePath).stage(input.paths);
  }),

  unstage: publicProcedure.input(gitPathsInputSchema).mutation(({ input }) => {
    const ws = requireWorkspace(input.workspaceId);
    return new GitService(ws.worktreePath).unstage(input.paths);
  }),

  discard: publicProcedure.input(gitPathsInputSchema).mutation(({ input }) => {
    const ws = requireWorkspace(input.workspaceId);
    return new GitService(ws.worktreePath).discard(input.paths);
  }),

  commit: publicProcedure.input(commitInputSchema).mutation(({ input }) => {
    const ws = requireWorkspace(input.workspaceId);
    return new GitService(ws.worktreePath).commit(input.summary, input.description);
  }),

  fetch: publicProcedure.input(gitWorkspaceInputSchema).mutation(async ({ input }) => {
    const ws = requireWorkspace(input.workspaceId);
    try {
      await githubService.fetch(ws.worktreePath);
    } catch (err) {
      throw remoteError(err);
    }
  }),

  pull: publicProcedure.input(gitWorkspaceInputSchema).mutation(async ({ input }) => {
    const ws = requireWorkspace(input.workspaceId);
    try {
      await githubService.pull(ws.worktreePath);
    } catch (err) {
      throw remoteError(err);
    }
  }),

  push: publicProcedure.input(gitWorkspaceInputSchema).mutation(async ({ input }) => {
    const ws = requireWorkspace(input.workspaceId);
    try {
      await githubService.push(ws.worktreePath, ws.branch);
    } catch (err) {
      throw remoteError(err);
    }
  }),

  /** Push the branch (if needed) and open a PR against the worktree's base branch. */
  createPr: publicProcedure
    .input(createPrInputSchema)
    .mutation(async ({ input }): Promise<CreatePrResult> => {
      const ws = requireWorkspace(input.workspaceId);
      if (!ws.projectId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This workspace is not part of a project, so its base branch is unknown.',
        });
      }
      const project = getProject(ws.projectId);
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });

      try {
        await githubService.push(ws.worktreePath, ws.branch);
        return await githubService.createPullRequest({
          worktreePath: ws.worktreePath,
          head: ws.branch,
          // The branch this worktree was cut from; legacy rows fall back to default.
          base: ws.baseRef ?? project.defaultBranch,
          title: input.title,
          body: input.body,
        });
      } catch (err) {
        throw remoteError(err);
      }
    }),
});
