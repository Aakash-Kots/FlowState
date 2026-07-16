/**
 * A small JSON key/value store for app settings (window bounds, UI prefs).
 * Backed by the `settings` table — a single source of truth on disk.
 */
import { eq } from 'drizzle-orm';
import {
  ArchiveRetention,
  CodeTheme,
  FontSize,
  type RecentWorkspaceEntry,
  recentWorkspacesSchema,
} from '@flowstate/shared';
import { getDb } from './db';
import { settings } from './schema';

///////////
// Types //
///////////

type WindowBounds = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};

///////////////
// Constants //
///////////////

const WINDOW_BOUNDS_KEY = 'window.bounds';
const SOUND_ENABLED_KEY = 'notifications.soundEnabled';
const CODE_THEME_KEY = 'appearance.codeTheme';
const FONT_SIZE_KEY = 'appearance.fontSize';
const ARCHIVE_RETENTION_KEY = 'worktree.archiveRetention';
const SKILLS_PANEL_WIDTH_KEY = 'skillsPanel.width';
const SKILLS_PANEL_OPEN_KEY = 'skillsPanel.open';
const TERMINAL_PANEL_FRACTION_KEY = 'terminalPanel.fraction';
const WORKSPACE_RECENT_KEY = 'workspace.recent';

/** How many recently-active worktrees to remember for reload restoration. */
const MAX_RECENT_WORKSPACES = 10;

/**
 * Default width (px) of the right-hand panel, and its clamp range. Wider than a
 * plain sidebar because the panel's bottom half hosts a live terminal.
 */
const DEFAULT_SKILLS_PANEL_WIDTH = 360;
const MIN_SKILLS_PANEL_WIDTH = 200;
const MAX_SKILLS_PANEL_WIDTH = 640;

/** Fraction (0–1) of the panel's height given to its bottom terminal section. */
const DEFAULT_TERMINAL_PANEL_FRACTION = 0.5;
const MIN_TERMINAL_PANEL_FRACTION = 0.15;
const MAX_TERMINAL_PANEL_FRACTION = 0.85;

/** The syntax-highlighting palette applied when the user hasn't picked one. */
const DEFAULT_CODE_THEME = CodeTheme.GithubDark;

/** The base UI text size applied when the user hasn't picked one. */
const DEFAULT_FONT_SIZE = FontSize.Default;

/** How long an archived worktree lingers on disk when the user hasn't chosen. */
const DEFAULT_ARCHIVE_RETENTION = ArchiveRetention.OneDay;

export function getSetting<T>(key: string): T | null {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  return row ? (JSON.parse(row.value) as T) : null;
}

export function setSetting<T>(key: string, value: T): void {
  const serialized = JSON.stringify(value);
  getDb()
    .insert(settings)
    .values({ key, value: serialized })
    .onConflictDoUpdate({ target: settings.key, set: { value: serialized } })
    .run();
}

export function getWindowBounds(): WindowBounds | null {
  return getSetting<WindowBounds>(WINDOW_BOUNDS_KEY);
}

export function setWindowBounds(bounds: WindowBounds): void {
  setSetting(WINDOW_BOUNDS_KEY, bounds);
}

/** Whether a sound plays when an agent finishes a turn in an unwatched tab (default on). */
export function getSoundEnabled(): boolean {
  return getSetting<boolean>(SOUND_ENABLED_KEY) ?? true;
}

export function setSoundEnabled(enabled: boolean): void {
  setSetting(SOUND_ENABLED_KEY, enabled);
}

/** The chosen code-highlighting palette (defaults to GitHub Dark). */
export function getCodeTheme(): CodeTheme {
  const stored = getSetting<CodeTheme>(CODE_THEME_KEY);
  // Guard against a stale/renamed value lingering in the KV store.
  return stored && Object.values(CodeTheme).includes(stored) ? stored : DEFAULT_CODE_THEME;
}

export function setCodeTheme(theme: CodeTheme): void {
  setSetting(CODE_THEME_KEY, theme);
}

/** The chosen base UI text size (defaults to Default). */
export function getFontSize(): FontSize {
  const stored = getSetting<FontSize>(FONT_SIZE_KEY);
  // Guard against a stale/renamed value lingering in the KV store.
  return stored && Object.values(FontSize).includes(stored) ? stored : DEFAULT_FONT_SIZE;
}

export function setFontSize(size: FontSize): void {
  setSetting(FONT_SIZE_KEY, size);
}

/** How long the reaper waits before deleting an archived worktree (default 24h). */
export function getArchiveRetention(): ArchiveRetention {
  const stored = getSetting<ArchiveRetention>(ARCHIVE_RETENTION_KEY);
  // Guard against a stale/renamed value lingering in the KV store.
  return stored && Object.values(ArchiveRetention).includes(stored)
    ? stored
    : DEFAULT_ARCHIVE_RETENTION;
}

export function setArchiveRetention(retention: ArchiveRetention): void {
  setSetting(ARCHIVE_RETENTION_KEY, retention);
}

/** Persisted width (px) of the Skills & Actions panel, clamped to its range. */
export function getSkillsPanelWidth(): number {
  const stored = getSetting<number>(SKILLS_PANEL_WIDTH_KEY);
  if (typeof stored !== 'number' || Number.isNaN(stored)) return DEFAULT_SKILLS_PANEL_WIDTH;
  return Math.min(MAX_SKILLS_PANEL_WIDTH, Math.max(MIN_SKILLS_PANEL_WIDTH, stored));
}

export function setSkillsPanelWidth(width: number): void {
  setSetting(
    SKILLS_PANEL_WIDTH_KEY,
    Math.min(MAX_SKILLS_PANEL_WIDTH, Math.max(MIN_SKILLS_PANEL_WIDTH, width)),
  );
}

/** Persisted fraction (0–1) of the panel height given to the terminal section. */
export function getTerminalPanelFraction(): number {
  const stored = getSetting<number>(TERMINAL_PANEL_FRACTION_KEY);
  if (typeof stored !== 'number' || Number.isNaN(stored)) return DEFAULT_TERMINAL_PANEL_FRACTION;
  return Math.min(MAX_TERMINAL_PANEL_FRACTION, Math.max(MIN_TERMINAL_PANEL_FRACTION, stored));
}

export function setTerminalPanelFraction(fraction: number): void {
  setSetting(
    TERMINAL_PANEL_FRACTION_KEY,
    Math.min(MAX_TERMINAL_PANEL_FRACTION, Math.max(MIN_TERMINAL_PANEL_FRACTION, fraction)),
  );
}

/** Whether the Skills & Actions panel is expanded (default open). */
export function getSkillsPanelOpen(): boolean {
  return getSetting<boolean>(SKILLS_PANEL_OPEN_KEY) ?? true;
}

export function setSkillsPanelOpen(open: boolean): void {
  setSetting(SKILLS_PANEL_OPEN_KEY, open);
}

/**
 * The worktrees the user visited, most-recent-first — the app reopens the first
 * still-existing entry on reload. Parsed defensively so a stale/renamed shape in
 * the KV store degrades to "no history" rather than throwing.
 */
export function getRecentWorkspaces(): RecentWorkspaceEntry[] {
  const parsed = recentWorkspacesSchema.safeParse(getSetting(WORKSPACE_RECENT_KEY));
  return parsed.success ? parsed.data : [];
}

/**
 * Record a worktree+tab as the most-recently active: move it to the front
 * (deduped by workspace, so each worktree keeps only its latest tab) and cap the
 * list length.
 */
export function rememberRecentWorkspace(entry: RecentWorkspaceEntry): void {
  const next = [entry, ...getRecentWorkspaces().filter((e) => e.workspaceId !== entry.workspaceId)];
  setSetting(WORKSPACE_RECENT_KEY, next.slice(0, MAX_RECENT_WORKSPACES));
}
