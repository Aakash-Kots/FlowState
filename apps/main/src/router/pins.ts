/**
 * Pinned Skills & Actions control plane — the shortcuts a user pins beside a
 * chat. `list` returns a worktree's pins split by scope (worktree-specific vs.
 * its repo's); `pin` appends a new shortcut to one scope; `unpin` removes it.
 * Persistence lives in the pins store.
 */
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { PinnedItemKind, type PinnedItem } from '@flowstate/shared';
import { z } from 'zod';
import { deletePin, listPinsForProject, listPinsForWorkspace, upsertPin } from '../store';
import { publicProcedure, router } from '../trpc';

export const pinsRouter = router({
  /** A worktree's pins, split into its own (worktree-scope) and its repo's (repo-scope). */
  list: publicProcedure
    .input(z.object({ workspaceId: z.string(), projectId: z.string().nullable() }))
    .query(({ input }): { worktree: PinnedItem[]; repo: PinnedItem[] } => ({
      worktree: listPinsForWorkspace(input.workspaceId),
      repo: input.projectId ? listPinsForProject(input.projectId) : [],
    })),

  /**
   * Pin a skill or action to a worktree or its repo. Exactly one of
   * `workspaceId` / `projectId` must be set; the server assigns the id, the
   * next position within that scope, and the timestamp.
   */
  pin: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().nullable(),
        projectId: z.string().nullable(),
        kind: z.nativeEnum(PinnedItemKind),
        ref: z.string().min(1),
        label: z.string().min(1),
      }),
    )
    .mutation(({ input }): PinnedItem => {
      const scoped = [input.workspaceId, input.projectId].filter(Boolean).length === 1;
      if (!scoped) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A pin must set exactly one of workspaceId or projectId.',
        });
      }
      const siblings = input.workspaceId
        ? listPinsForWorkspace(input.workspaceId)
        : listPinsForProject(input.projectId!);
      const position = siblings.reduce((max, p) => Math.max(max, p.position), -1) + 1;
      return upsertPin({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        kind: input.kind,
        ref: input.ref,
        label: input.label,
        position,
        createdAt: new Date().toISOString(),
      });
    }),

  unpin: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    deletePin(input.id);
  }),
});
