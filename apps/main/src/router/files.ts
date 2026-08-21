/**
 * Files control plane — lists/reads/writes files in a worktree for the ⌘P finder
 * and the in-tab editor. Every procedure is keyed by `workspaceId` (a Workspace =
 * one git worktree); the worktree path is resolved from the store and all file
 * access is confined to it by `FilesService`.
 */
import {
  type DirEntry,
  type FileContent,
  type Project,
  type Workspace,
  fileReadInputSchema,
  fileWriteInputSchema,
  filesListForProjectInputSchema,
  filesListInputSchema,
  filesReadDirInputSchema,
} from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { getProject, getRecentFiles, getWorkspace, rememberRecentFile } from '../store';
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

/** Resolve a project to its local clone, or fail with NOT_FOUND. */
function requireProject(projectId: string): Project {
  const project = getProject(projectId);
  if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });
  return project;
}

export const filesRouter = router({
  /** Every file under version control in the worktree (finder candidates). */
  list: publicProcedure.input(filesListInputSchema).query(({ input }): Promise<string[]> => {
    const ws = requireWorkspace(input.workspaceId);
    return new FilesService(ws.worktreePath).list();
  }),

  /** One directory level of the worktree — lazy file-tree expansion. */
  readDir: publicProcedure
    .input(filesReadDirInputSchema)
    .query(({ input }): Promise<DirEntry[]> => {
      const ws = requireWorkspace(input.workspaceId);
      return new FilesService(ws.worktreePath).readDir(input.dir);
    }),

  /**
   * Every file in a project's local clone — mention candidates for the
   * create-worktree modal, which has no worktree path yet.
   */
  listForProject: publicProcedure
    .input(filesListForProjectInputSchema)
    .query(({ input }): Promise<string[]> => {
      const project = requireProject(input.projectId);
      return new FilesService(project.localPath).list();
    }),

  /** The worktree's most-recently-opened files (⌘P empty-state candidates). */
  recent: publicProcedure.input(filesListInputSchema).query(({ input }): string[] => {
    requireWorkspace(input.workspaceId);
    return getRecentFiles(input.workspaceId);
  }),

  /** Mark a file as just-opened, so it surfaces in the ⌘P "Recent files" list. */
  recordRecent: publicProcedure.input(fileReadInputSchema).mutation(({ input }): void => {
    requireWorkspace(input.workspaceId);
    rememberRecentFile(input.workspaceId, input.path);
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
