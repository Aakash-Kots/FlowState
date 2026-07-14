/**
 * FilesService — lists, reads, and writes files inside a single worktree for the
 * ⌘P file finder and the in-tab code editor. `list()` uses `git ls-files` so it
 * matches what's under version control (tracked + untracked, honoring
 * `.gitignore`) and skips `node_modules`/build junk. Read/write confine every
 * path to the worktree — the one place in the app that touches arbitrary files,
 * so path traversal out of the worktree is rejected here.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { TRPCError } from '@trpc/server';
import { simpleGit } from 'simple-git';

/////////////
// Constants //
/////////////

/** Reject reads above this size — the editor is for source, not blobs. */
const MAX_READ_BYTES = 2 * 1024 * 1024;

/**
 * Directories/patterns pruned from the finder even though they're not
 * `.gitignore`-respected here. We deliberately list ignored files (so `.env` and
 * other gitignored config are editable) but skip the dependency/build/VCS junk
 * that would otherwise flood the list with tens of thousands of entries.
 */
const LIST_EXCLUDES = [
  'node_modules',
  '.git',
  '.next',
  'out',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '*.tsbuildinfo',
];

///////////
// Service //
///////////

export class FilesService {
  constructor(private readonly worktreePath: string) {}

  /**
   * Every file under version control in the worktree: tracked plus untracked,
   * with `.gitignore`d paths excluded. Sorted for a stable finder order.
   */
  async list(): Promise<string[]> {
    // Note: no `--exclude-standard`, so `.gitignore`d files (e.g. `.env`) ARE
    // listed and editable; `LIST_EXCLUDES` prunes only the heavy dependency/
    // build/VCS dirs. `-z` NUL-separates and disables path quoting, so non-ASCII
    // names come through verbatim. Dedupe: `--cached` + `--others` can overlap.
    const raw = await simpleGit(this.worktreePath).raw([
      'ls-files',
      '--cached',
      '--others',
      '-z',
      ...LIST_EXCLUDES.flatMap((pattern) => ['-x', pattern]),
    ]);
    const seen = new Set(raw.split('\0').filter((p) => p.length > 0));
    return [...seen].sort((a, b) => a.localeCompare(b));
  }

  /** Read a worktree-relative file as UTF-8 text. Rejects binaries and huge files. */
  async read(relPath: string): Promise<string> {
    const abs = this.resolveInWorktree(relPath);
    const buf = await readFile(abs);
    if (buf.byteLength > MAX_READ_BYTES) {
      throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: 'File is too large to open.' });
    }
    if (buf.includes(0)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot open a binary file.' });
    }
    return buf.toString('utf8');
  }

  /** Overwrite a worktree-relative file with UTF-8 text. */
  async write(relPath: string, content: string): Promise<void> {
    const abs = this.resolveInWorktree(relPath);
    await writeFile(abs, content, 'utf8');
  }

  /////////////
  // Helpers //
  /////////////

  /**
   * Resolve a worktree-relative path to an absolute one, refusing anything that
   * escapes the worktree (e.g. `../../etc/passwd`). This is the security boundary
   * for the read/write endpoints.
   */
  private resolveInWorktree(relPath: string): string {
    const abs = resolve(this.worktreePath, relPath);
    if (abs !== this.worktreePath && !abs.startsWith(this.worktreePath + sep)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Path is outside the worktree.' });
    }
    return abs;
  }
}
