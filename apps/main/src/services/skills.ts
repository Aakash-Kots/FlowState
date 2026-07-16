/**
 * SkillsImportService — discovers skill files that live outside the current
 * worktree and copies a chosen one into it so the Claude session can use it (and
 * the repo can commit + push it). Sources: other FlowState projects'
 * `.claude/skills/`, the user's global `~/.claude/skills/`, and installed plugin
 * marketplaces (`~/.claude/plugins/marketplaces/**​/skills/`). Two on-disk skill
 * shapes are handled: a single `<name>.md`, and a directory `<name>/SKILL.md`
 * (with its supporting assets). The router layers the git commit/push + auto-pin
 * on top; this service only touches the filesystem.
 */
import { type Dirent } from 'node:fs';
import { cp, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { SkillImportOrigin, type ImportableSkill } from '@flowstate/shared';
import { TRPCError } from '@trpc/server';
import { listProjects } from '../store';

///////////
// Types //
///////////

/** A skill found on disk. `key` is its `.claude/skills` basename (file or dir) — used to dedupe + as the copy target. */
type DiskSkill = { name: string; description: string | null; sourcePath: string; key: string };

/** A directory to scan for skills, tagged with how to label/where it came from. */
type SkillSource = { dir: string; origin: SkillImportOrigin; label: string };

/////////////
// Helpers //
/////////////

/** The `.claude/skills` directory under a repo/worktree root. */
function skillsDir(root: string): string {
  return join(root, '.claude', 'skills');
}

/** True if `path` is a directory (false when missing or a file). */
async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** List a directory's entries, or `[]` when it doesn't exist. */
async function readdirOrEmpty(path: string): Promise<Dirent[]> {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Read a file as UTF-8, or null when it doesn't exist. */
async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Pull `name` / `description` out of a skill file's leading YAML frontmatter.
 * Deliberately minimal (no yaml dep in the repo): reads the first `---`…`---`
 * block and the flat single-line `key: value` fields we care about.
 */
function parseFrontmatter(content: string): { name: string | null; description: string | null } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  const block = match?.[1];
  if (!block) return { name: null, description: null };
  const read = (key: string): string | null => {
    const value = new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, 'm').exec(block)?.[1];
    if (!value) return null;
    return value.replace(/^["']|["']$/g, '').trim() || null;
  };
  return { name: read('name'), description: read('description') };
}

/**
 * Every skill directly inside a `.claude/skills`-style directory: single
 * `<name>.md` files plus `<name>/SKILL.md` directories. Missing dir → `[]`.
 */
async function discoverSkills(dir: string): Promise<DiskSkill[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // missing dir — no skills here
  }
  const out: DiskSkill[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'SKILL.md') {
      const sourcePath = join(dir, entry.name);
      const { name, description } = parseFrontmatter(await readFile(sourcePath, 'utf8'));
      out.push({ name: name ?? entry.name.replace(/\.md$/, ''), description, sourcePath, key: entry.name });
    } else if (entry.isDirectory()) {
      const content = await readFileOrNull(join(dir, entry.name, 'SKILL.md'));
      if (content !== null) {
        const { name, description } = parseFrontmatter(content);
        out.push({ name: name ?? entry.name, description, sourcePath: join(dir, entry.name), key: entry.name });
      }
    }
  }
  return out;
}

/////////////
// Service //
/////////////

export class SkillsImportService {
  /** The user's Claude config dir, honoring `CLAUDE_CONFIG_DIR` like `claude.ts`. */
  private configDir(): string {
    return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  }

  /** Every `skills/` directory under installed plugin marketplaces (both nesting layouts). */
  private async pluginSkillDirs(): Promise<SkillSource[]> {
    const root = join(this.configDir(), 'plugins', 'marketplaces');
    const sources: SkillSource[] = [];
    for (const market of await readdirOrEmpty(root)) {
      if (!market.isDirectory()) continue;
      const label = market.name;
      // Layout A: marketplaces/<market>/skills
      if (await isDir(join(root, market.name, 'skills'))) {
        sources.push({ dir: join(root, market.name, 'skills'), origin: SkillImportOrigin.Plugin, label });
      }
      // Layout B: marketplaces/<market>/<plugin>/skills
      for (const plugin of await readdirOrEmpty(join(root, market.name))) {
        if (plugin.isDirectory() && (await isDir(join(root, market.name, plugin.name, 'skills')))) {
          sources.push({
            dir: join(root, market.name, plugin.name, 'skills'),
            origin: SkillImportOrigin.Plugin,
            label,
          });
        }
      }
    }
    return sources;
  }

  /**
   * Skills the user could import into `currentWorktreePath`: everything in other
   * projects' `.claude/skills/`, the global dir, and plugin marketplaces — minus
   * any already present in this worktree (so we never offer a skill it has).
   */
  async listImportable(currentWorktreePath: string): Promise<ImportableSkill[]> {
    const existing = new Set((await discoverSkills(skillsDir(currentWorktreePath))).map((s) => s.key));
    const sources: SkillSource[] = [
      ...listProjects().map((p) => ({
        dir: skillsDir(p.localPath),
        origin: SkillImportOrigin.Project,
        label: p.name,
      })),
      { dir: skillsDir(this.configDir()), origin: SkillImportOrigin.Global, label: 'Global' },
      ...(await this.pluginSkillDirs()),
    ];

    const results: ImportableSkill[] = [];
    for (const src of sources) {
      for (const skill of await discoverSkills(src.dir)) {
        if (existing.has(skill.key)) continue; // already usable in this worktree
        results.push({
          name: skill.name,
          description: skill.description,
          sourcePath: skill.sourcePath,
          origin: src.origin,
          sourceLabel: src.label,
        });
      }
    }
    return results;
  }

  /**
   * Copy the skill at `sourcePath` into `worktreePath/.claude/skills/`. Accepts a
   * single `.md`, a skill directory, or a `SKILL.md` (whose parent directory is
   * copied). Returns the skill's `name` and the worktree-relative path of the
   * copy (a file or a directory) — the latter for a targeted git commit.
   */
  async importInto(
    worktreePath: string,
    sourcePath: string,
  ): Promise<{ name: string; relPath: string }> {
    // Resolve what to copy + which markdown carries the frontmatter.
    let copyFrom = sourcePath;
    let markdownPath = sourcePath;
    if (await isDir(sourcePath)) {
      markdownPath = join(sourcePath, 'SKILL.md');
    } else if (basename(sourcePath) === 'SKILL.md') {
      copyFrom = dirname(sourcePath); // a directory skill referenced by its SKILL.md
    } else if (!sourcePath.endsWith('.md')) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'A skill must be a .md file or a skill directory.' });
    }

    const key = basename(copyFrom);
    const dest = resolve(skillsDir(worktreePath), key);
    // Confine the write to the worktree (mirrors FilesService.resolveInWorktree).
    if (dest !== worktreePath && !dest.startsWith(worktreePath + sep)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Destination is outside the worktree.' });
    }

    await mkdir(skillsDir(worktreePath), { recursive: true });
    await cp(copyFrom, dest, { recursive: true }); // recursive is harmless for a single file

    const content = (await readFileOrNull(markdownPath)) ?? '';
    const { name } = parseFrontmatter(content);
    const fallback = key.endsWith('.md') ? key.replace(/\.md$/, '') : key;
    return { name: name ?? fallback, relPath: join('.claude', 'skills', key) };
  }
}

/** App-wide singleton — the import service is stateless. */
export const skillsImportService = new SkillsImportService();
