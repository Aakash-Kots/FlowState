'use client';

import { useEffect, type ReactNode } from 'react';
import { ShortcutScope } from '@flowstate/shared';
import { trpc } from '@/lib/trpc';
import { DispatchSource } from '@/lib/enums/shortcut';
import { COMMANDS } from '@/lib/shortcuts/commands';
import { dispatch } from '@/lib/shortcuts/dispatch';
import { hasModifier, isEditableTarget, matchesChord } from '@/lib/shortcuts/keys';
import { hydrateShortcuts, setSidebarToggle, useShortcuts } from '@/lib/shortcuts/store';
import { openAskGemma } from '@/lib/gemma';
import { useSidebar } from '@/components/ui/sidebar';
import { AskGemmaPalette } from '@/components/gemma/AskGemmaPalette';
import { SearchPalette } from '@/components/search/SearchPalette';
import { CommandPalette } from './CommandPalette';
import { ShortcutsHelp } from './ShortcutsHelp';

/** Max gap (ms) between the two Space presses that open the Ask-Gemma palette. */
const DOUBLE_SPACE_MS = 350;

// Subscribe to menu-triggered commands exactly once for the app's lifetime
// (mirrors the chat/terminal subscription guard — no cleanup, StrictMode-safe).
let menuChannelStarted = false;

/**
 * The keymap engine's runtime. Mounts a single global keydown listener that
 * matches events against the resolved keymap and dispatches, subscribes to the
 * Electron menu's `shortcuts.onCommand` channel (so accelerators work even when a
 * native surface has focus), and bridges the sidebar toggle into the command
 * registry. Must render inside `SidebarProvider` so it can read `useSidebar`.
 */
export function ShortcutProvider({ children }: { children: ReactNode }) {
  const { toggleSidebar } = useSidebar();

  // Bridge the sidebar toggle so the ToggleSidebar command can reach it.
  useEffect(() => {
    setSidebarToggle(toggleSidebar);
    return () => setSidebarToggle(null);
  }, [toggleSidebar]);

  // Load persisted overrides, wire the global keydown listener + menu channel.
  useEffect(() => {
    hydrateShortcuts();

    const handleKeyDown = (e: KeyboardEvent) => {
      const match = useShortcuts.getState().bindings.find((b) => matchesChord(e, b.keys));
      if (!match) return;
      const def = COMMANDS[match.command];
      // Don't steal keystrokes from a focused text field unless the chord carries
      // an escaping modifier (this is why ⌘-combos work while typing).
      const editing = isEditableTarget(e.target);
      if (editing && (def.scope === ShortcutScope.Editor || !hasModifier(match.keys))) return;
      e.preventDefault();
      dispatch(match.command, DispatchSource.Keydown);
    };
    window.addEventListener('keydown', handleKeyDown);

    if (!menuChannelStarted) {
      menuChannelStarted = true;
      trpc().shortcuts.onCommand.subscribe(undefined, {
        onData: (command) => dispatch(command, DispatchSource.Menu),
        onError: () => {},
      });
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Double-tap Space (outside a text field) opens the Ask-Gemma palette. Guarded
  // against editable targets so it never hijacks normal typing.
  useEffect(() => {
    let lastSpace = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.code !== 'Space') return;
      if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return;
      const now = performance.now();
      if (now - lastSpace < DOUBLE_SPACE_MS) {
        lastSpace = 0;
        e.preventDefault();
        openAskGemma();
      } else {
        lastSpace = now;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      {children}
      <CommandPalette />
      <SearchPalette />
      <AskGemmaPalette />
      <ShortcutsHelp />
    </>
  );
}
