/**
 * Files control plane — lists/reads/writes files in a worktree for the ⌘P finder
 * and the in-tab editor. Every procedure is keyed by `workspaceId` (a Workspace =
 * one git worktree); the worktree path is resolved from the store and all file
 * access is confined to it by `FilesService`.
 */
import {
  type FileContent,
  type Workspace,
  fileReadInputSchema,
  fileWriteInputSchema,
  filesListInputSchema,
} from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { getWorkspace } from '../store';
import { FilesService } from '../services/files';
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

export const filesRouter = router({
  /** Every file under version control in the worktree (finder candidates). */
  list: publicProcedure.input(filesListInputSchema).query(({ input }): Promise<string[]> => {
    const ws = requireWorkspace(input.workspaceId);
    return new FilesService(ws.worktreePath).list();
  }),

  /** A single file's text, echoed back with its path. */
  read: publicProcedure
    .input(fileReadInputSchema)
    .query(async ({ input }): Promise<FileContent> => {
      const ws = requireWorkspace(input.workspaceId);
      const content = await new FilesService(ws.worktreePath).read(input.path);
      return { path: input.path, content };
    }),

  /** Overwrite a single file on disk. */
  write: publicProcedure.input(fileWriteInputSchema).mutation(async ({ input }): Promise<void> => {
    const ws = requireWorkspace(input.workspaceId);
    await new FilesService(ws.worktreePath).write(input.path, input.content);
  }),
});
