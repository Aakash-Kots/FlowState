import { z } from 'zod';
import { GitService } from '../services/git';
import { publicProcedure, router } from '../trpc';

// Stub router — see GitService / milestone 3.
export const gitRouter = router({
  status: publicProcedure
    .input(z.object({ worktreePath: z.string() }))
    .query(({ input }) => new GitService(input.worktreePath).status()),
});
