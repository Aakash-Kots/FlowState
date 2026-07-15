/**
 * Linear control plane. Reads the issues assigned to the linked account so the
 * renderer can offer them when creating a worktree. Auth lives on the onboarding
 * router / AuthService; this router is a thin door over `linearService`.
 */
import { type LinearIssueRef, linearIssueRefSchema } from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { linearService } from '../services/linear';
import { publicProcedure, router } from '../trpc';

const myIssuesSchema = z.array(linearIssueRefSchema);

export const linearRouter = router({
  /** Issues assigned to the linked user (all states), newest first. */
  myIssues: publicProcedure.query(async (): Promise<LinearIssueRef[]> => {
    try {
      return myIssuesSchema.parse(await linearService.myIssues());
    } catch (err) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Failed to load Linear issues.',
      });
    }
  }),
});
