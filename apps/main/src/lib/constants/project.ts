/**
 * Project path constants (main-process only — these drive filesystem paths for
 * the repos FlowState clones, so they never cross into shared).
 */
import { homedir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';

/** Where FlowState-cloned projects live: `~/FlowState/projects/<repo>`. */
export const PROJECTS_DIR = join(homedir(), 'FlowState', 'projects');

/**
 * Whether `localPath` is a FlowState-managed clone (lives inside PROJECTS_DIR)
 * rather than a folder the user brought in from elsewhere. Only managed clones
 * are safe to delete from disk when their project is removed.
 */
export function isManagedClone(localPath: string): boolean {
  const rel = relative(PROJECTS_DIR, localPath);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
