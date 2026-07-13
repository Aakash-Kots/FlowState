'use client';

import type { ShortcutCommand } from '@flowstate/shared';
import { COMMAND_LIST } from '@/lib/shortcuts/commands';
import { dispatch } from '@/lib/shortcuts/dispatch';
import { formatChord } from '@/lib/shortcuts/keys';
import { setPaletteOpen, useShortcuts } from '@/lib/shortcuts/store';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';

/** ⌘K command palette: a searchable list of every command with its binding. */
export function CommandPalette() {
  const open = useShortcuts((s) => s.paletteOpen);
  const bindings = useShortcuts((s) => s.bindings);

  const chordFor = (command: ShortcutCommand) => bindings.find((b) => b.command === command)?.keys;

  const run = (command: ShortcutCommand) => {
    setPaletteOpen(false);
    dispatch(command);
  };

  return (
    <CommandDialog open={open} onOpenChange={setPaletteOpen}>
      <CommandInput placeholder="Type a command…" />
      <CommandList>
        <CommandEmpty>No commands found.</CommandEmpty>
        <CommandGroup>
          {COMMAND_LIST.map((def) => {
            const chord = chordFor(def.command);
            const disabled = def.isEnabled ? !def.isEnabled() : false;
            return (
              <CommandItem
                key={def.command}
                value={def.label}
                disabled={disabled}
                onSelect={() => run(def.command)}
              >
                <span className="flex-1">{def.label}</span>
                {chord && <Kbd keys={formatChord(chord)} />}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
