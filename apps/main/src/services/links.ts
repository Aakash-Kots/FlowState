/**
 * FileLinkService — brings a project's gitignored config into a fresh worktree.
 * A new `git worktree` is a clean checkout, so files that live only in the
 * primary clone (`.env`, `.env.local`, …) are missing. We symlink them across
 * with an absolute target, so rotating a secret in the clone is instantly
 * visible in every worktree instead of drifting per copy.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ENV_FILE_PATTERN } from '../lib/constants/worktree';

export class FileLinkService {
  /** Root-level `.env*` files in the repo, as paths relative to `repoRoot`. */
  async detectEnvFiles(repoRoot: string): Promise<string[]> {
    const entries = await readdir(repoRoot, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && ENV_FILE_PATTERN.test(e.name)).map((e) => e.name);
  }

  /**
   * Symlink each relative `path` from `repoRoot` into `worktreePath` (absolute
   * target, idempotent). Missing sources and already-present destinations are
   * skipped. Returns the paths actually linked.
   */
  async linkInto(repoRoot: string, worktreePath: string, relPaths: string[]): Promise<string[]> {
    const linked: string[] = [];
    for (const rel of relPaths) {
      const src = join(repoRoot, rel);
      const dst = join(worktreePath, rel);
      if (!existsSync(src) || existsSync(dst)) continue;
      await mkdir(dirname(dst), { recursive: true });
      await symlink(src, dst);
      linked.push(rel);
    }
    return linked;
  }
}

/** Shared singleton — the worktree router links files through one instance. */
export const fileLinkService = new FileLinkService();
