'use client';

import type { ShortcutCommand } from '@flowstate/shared';
import { DispatchSource } from '../enums/shortcut';
import { COMMANDS } from './commands';

///////////////
// Types     //
///////////////

/** The last time a command ran, and which source ran it. */
type LastRun = { at: number; source: DispatchSource };

///////////////
// Constants //
///////////////

/**
 * One keystroke can arrive twice — once from the web keydown listener and once
 * from the native menu channel (Electron may deliver both for an accelerator).
 * We only suppress that *cross-source* echo within this window; two presses from
 * the same source (a genuine fast double-tap) both run. Kept short so it can't
 * swallow a real repeat.
 */
const DEDUPE_MS = 200;

/////////////
// Helpers //
/////////////

const lastRun = new Map<ShortcutCommand, LastRun>();

/**
 * Run a command by id — the single entry point shared by the web keydown
 * listener (`DispatchSource.Keydown`) and the `shortcuts.onCommand` menu channel
 * (`DispatchSource.Menu`). Disabled commands are no-ops, and a same-keystroke
 * echo from the *other* source inside `DEDUPE_MS` is dropped; a repeat from the
 * same source is honoured so tapping a cycle shortcut twice quickly moves twice.
 */
export function dispatch(
  command: ShortcutCommand,
  source: DispatchSource = DispatchSource.Keydown,
): void {
  const def = COMMANDS[command];
  if (!def) return;
  if (def.isEnabled && !def.isEnabled()) return;

  const now = Date.now();
  const prev = lastRun.get(command);
  // Drop only the menu/keydown echo of one keystroke — not a real double-tap.
  if (prev && prev.source !== source && now - prev.at < DEDUPE_MS) return;
  lastRun.set(command, { at: now, source });

  void def.run();
}
