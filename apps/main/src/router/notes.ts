/**
 * Header notes control plane — the freeform Markdown pads the user jots into from
 * the header. `get` returns a scope's pad (the app-wide Global pad when
 * `workspaceId` is null, else a worktree's); `save` upserts it. Persistence lives
 * in the notes store.
 */
import { type Note } from '@flowstate/shared';
import { z } from 'zod';
import { getNote, saveNote } from '../store';
import { publicProcedure, router } from '../trpc';

export const notesRouter = router({
  /** A scope's pad: pass `null` for the app-wide Global pad, else a worktree id. */
  get: publicProcedure
    .input(z.object({ workspaceId: z.string().nullable() }))
    .query(({ input }): Note | null => getNote(input.workspaceId)),

  /** Save a scope's pad; the server owns the id and timestamp. */
  save: publicProcedure
    .input(z.object({ workspaceId: z.string().nullable(), body: z.string() }))
    .mutation(({ input }): Note => saveNote(input.workspaceId, input.body)),
});
