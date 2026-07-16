'use client';

import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { RotateCcw, X } from 'lucide-react';
import { ShortcutCategory } from '@flowstate/shared';
import { COMMAND_LIST, type CommandDef } from '@/lib/shortcuts/commands';
import { eventToChord, formatChord } from '@/lib/shortcuts/keys';
import { resetBinding, setBinding, setHelpOpen, useShortcuts } from '@/lib/shortcuts/store';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/components/ui/cn';

///////////////
// Constants //
///////////////

/** Category display order + labels for the cheat-sheet sections. */
const CATEGORY_LABELS: [ShortcutCategory, string][] = [
  [ShortcutCategory.Tabs, 'Tabs'],
  [ShortcutCategory.Navigation, 'Navigation'],
  [ShortcutCategory.Session, 'Session'],
  [ShortcutCategory.Linear, 'Linear'],
  [ShortcutCategory.App, 'App'],
];

/////////////
// Helpers //
/////////////

/** A single command row with its binding and rebind / reset affordances. */
function ShortcutRow({ def }: { def: CommandDef }) {
  const keys = useShortcuts((s) => s.bindings.find((b) => b.command === def.command)?.keys);
  const overridden = useShortcuts((s) => def.command in s.overrides);
  const [capturing, setCapturing] = useState(false);

  // While capturing, the next non-modifier keystroke becomes the new binding.
  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(false);
        return;
      }
      const chord = eventToChord(e);
      if (!chord) return; // bare modifier — keep waiting
      setBinding(def.command, chord);
      setCapturing(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturing, def.command]);

  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-foreground">{def.label}</span>
      <div className="flex items-center gap-2">
        {overridden && (
          <button
            type="button"
            title="Reset to default"
            onClick={() => resetBinding(def.command)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setCapturing(true)}
          className={cn(
            'rounded-md border border-transparent px-1 py-0.5 transition-colors hover:border-border',
            capturing && 'border-border',
          )}
        >
          {capturing ? (
            <span className="text-xs text-muted-foreground">Press keys…</span>
          ) : keys ? (
            <Kbd keys={formatChord(keys)} />
          ) : (
            <span className="text-xs text-muted-foreground">Unbound</span>
          )}
        </button>
      </div>
    </div>
  );
}

///////////////////
// Cheat-sheet   //
///////////////////

/** The keyboard-shortcuts cheat-sheet + rebinding surface (opened with `?`). */
export function ShortcutsHelp() {
  const open = useShortcuts((s) => s.helpOpen);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setHelpOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-2xl shadow-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="mb-4 flex items-center justify-between">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              Keyboard Shortcuts
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Click any binding to reassign it. Press Esc to cancel.
          </p>
          <div className="space-y-5">
            {CATEGORY_LABELS.map(([category, label]) => {
              const commands = COMMAND_LIST.filter((d) => d.category === category);
              if (commands.length === 0) return null;
              return (
                <section key={category}>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </h3>
                  <div className="divide-y divide-border/50">
                    {commands.map((def) => (
                      <ShortcutRow key={def.command} def={def} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
