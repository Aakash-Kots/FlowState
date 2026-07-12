import { createWorkspaceInputSchema } from '@flowstate/shared';
import { WorktreeService } from '../services/worktree';
import { publicProcedure, router } from '../trpc';

const worktrees = new WorktreeService();

// Stub router — see WorktreeService / milestone 3.
export const worktreeRouter = router({
  list: publicProcedure.query(() => worktrees.list()),
  create: publicProcedure
    .input(createWorkspaceInputSchema)
    .mutation(({ input }) => worktrees.create(input)),
});
