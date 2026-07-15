'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { ArchiveRetention, CodeTheme, FontSize } from '@flowstate/shared';
import { trpc } from './trpc';

///////////
// Types //
///////////

type SettingsState = {
  /** True once preferences have loaded from the main process. */
  hydrated: boolean;
  /** Play a sound when a background agent finishes a turn. */
  soundEnabled: boolean;
  /** The syntax-highlighting palette for code surfaces (diffs, chat blocks). */
  codeTheme: CodeTheme;
  /** The base UI text size; drives the root font size the whole UI scales from. */
  fontSize: FontSize;
  /** How long an archived worktree lingers on disk before the reaper deletes it. */
  archiveRetention: ArchiveRetention;
  /** Whether the full-screen Settings surface is open (UI-only, not persisted). */
  settingsOpen: boolean;
  /** Width (px) of the chat view's Skills & Actions panel. */
  skillsPanelWidth: number;
  /** Whether the Skills & Actions panel is expanded. */
  skillsPanelOpen: boolean;
};

///////////////
// Constants //
///////////////

const INITIAL: SettingsState = {
  hydrated: false,
  soundEnabled: true,
  codeTheme: CodeTheme.GithubDark,
  fontSize: FontSize.Default,
  archiveRetention: ArchiveRetention.OneDay,
  settingsOpen: false,
  skillsPanelWidth: 280,
  skillsPanelOpen: true,
};

export const useSettings = create<SettingsState>(() => INITIAL);

/////////////
// Helpers //
/////////////

let started = false;

/** Root `html` font size (px) for each text-size choice; the UI scales from it. */
const FONT_SIZE_PX: Record<FontSize, string> = {
  [FontSize.Small]: '15px',
  [FontSize.Default]: '17px',
  [FontSize.Large]: '19px',
  [FontSize.ExtraLarge]: '21px',
};

/** Drive the CSS `data-code-theme` attribute that swaps the highlight palette. */
function applyCodeTheme(theme: CodeTheme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.codeTheme = theme;
  }
}

/** Set the root font size the rem-based UI scales from. */
function applyFontSize(size: FontSize): void {
  if (typeof document !== 'undefined') {
    document.documentElement.style.fontSize = FONT_SIZE_PX[size];
  }
}

// Sync + actions

/** Load app preferences once for the app's lifetime and apply the code theme. */
export function useSettingsSync(): void {
  useEffect(() => {
    if (started) return;
    started = true;
    trpc()
      .settings.get.query()
      .then(
        ({
          soundEnabled,
          codeTheme,
          fontSize,
          archiveRetention,
          skillsPanelWidth,
          skillsPanelOpen,
        }) => {
          useSettings.setState({
            hydrated: true,
            soundEnabled,
            codeTheme,
            fontSize,
            archiveRetention,
            skillsPanelWidth,
            skillsPanelOpen,
          });
          applyCodeTheme(codeTheme);
          applyFontSize(fontSize);
        },
      )
      .catch(() => useSettings.setState({ hydrated: true }));
  }, []);
}

/** Toggle the completion sound (optimistic; persisted in the main process). */
export function setSoundEnabled(enabled: boolean): void {
  useSettings.setState({ soundEnabled: enabled });
  void trpc().settings.setSoundEnabled.mutate({ enabled });
}

/** Choose the code-highlighting palette (optimistic + applied immediately). */
export function setCodeTheme(theme: CodeTheme): void {
  useSettings.setState({ codeTheme: theme });
  applyCodeTheme(theme);
  void trpc().settings.setCodeTheme.mutate({ theme });
}

/** Choose the base UI text size (optimistic + applied immediately). */
export function setFontSize(size: FontSize): void {
  useSettings.setState({ fontSize: size });
  applyFontSize(size);
  void trpc().settings.setFontSize.mutate({ size });
}

/** Choose how long archived worktrees linger before deletion (optimistic). */
export function setArchiveRetention(retention: ArchiveRetention): void {
  useSettings.setState({ archiveRetention: retention });
  void trpc().settings.setArchiveRetention.mutate({ retention });
}

/** Open or close the Settings surface. */
export function setSettingsOpen(open: boolean): void {
  useSettings.setState({ settingsOpen: open });
}

/** Clamp range for the Skills & Actions panel width (mirrors the main store). */
const SKILLS_PANEL_MIN_WIDTH = 200;
const SKILLS_PANEL_MAX_WIDTH = 520;

/** Set the Skills & Actions panel width live; persist separately on drag end. */
export function setSkillsPanelWidth(width: number): void {
  const clamped = Math.min(SKILLS_PANEL_MAX_WIDTH, Math.max(SKILLS_PANEL_MIN_WIDTH, width));
  useSettings.setState({ skillsPanelWidth: clamped });
}

/** Persist the current panel width (called once when a resize drag finishes). */
export function persistSkillsPanelWidth(): void {
  void trpc().settings.setSkillsPanelWidth.mutate({
    width: useSettings.getState().skillsPanelWidth,
  });
}

/** Expand or collapse the Skills & Actions panel (optimistic + persisted). */
export function setSkillsPanelOpen(open: boolean): void {
  useSettings.setState({ skillsPanelOpen: open });
  void trpc().settings.setSkillsPanelOpen.mutate({ open });
}
