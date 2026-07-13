'use client';

import type { ShortcutCommand } from '@flowstate/shared';
import { COMMANDS } from './commands';

///////////////
// Constants //
///////////////

/**
 * A command dispatched from the native menu and from the web keydown within this
 * window is the same keystroke fired twice — Electron may deliver both. Ignore a
 * repeat of the same command inside this window.
 */
const DEDUPE_MS = 200;

/////////////
// Helpers //
/////////////

const lastRun = new Map<ShortcutCommand, number>();

/**
 * Run a command by id — the single entry point shared by the web keydown
 * listener and the `shortcuts.onCommand` menu channel. Disabled commands and
 * rapid duplicates (menu + keydown for one keystroke) are no-ops.
 */
export function dispatch(command: ShortcutCommand): void {
  const def = COMMANDS[command];
  if (!def) return;
  if (def.isEnabled && !def.isEnabled()) return;

  const now = Date.now();
  const prev = lastRun.get(command);
  if (prev !== undefined && now - prev < DEDUPE_MS) return;
  lastRun.set(command, now);

  void def.run();
}
