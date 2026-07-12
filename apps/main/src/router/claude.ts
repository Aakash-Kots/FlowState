import { z } from 'zod';
import { ClaudeService } from '../services/claude';
import { publicProcedure, router } from '../trpc';

// Stub router — see ClaudeService / milestone 4.
export const claudeRouter = router({
  start: publicProcedure
    .input(z.object({ worktreePath: z.string(), prompt: z.string() }))
    .mutation(({ input }) => new ClaudeService(input.worktreePath).start(input.prompt)),
});
