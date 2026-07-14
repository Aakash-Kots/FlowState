'use client';

import { useState } from 'react';
import type { SkillOption } from '@flowstate/shared';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';

///////////
// Types //
///////////

// The scope a pin is filed under — string-literal, mirrored by the panel/store.
type PinScope = 'worktree' | 'repo';

/**
 * The "pin a skill" flow: a searchable modal of every discovered skill, then a
 * scope choice (this worktree vs. this repo). `canPinRepo` is false when the
 * active workspace has no parent project, hiding the repo option.
 */
export function SkillPicker({
  open,
  onOpenChange,
  skills,
  canPinRepo,
  onPin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: SkillOption[];
  canPinRepo: boolean;
  onPin: (skill: SkillOption, scope: PinScope) => void;
}) {
  const [chosen, setChosen] = useState<SkillOption | null>(null);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setChosen(null);
  };

  const pin = (scope: PinScope) => {
    if (chosen) onPin(chosen, scope);
    close(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={close}>
      {chosen ? (
        <div className="p-4">
          <p className="mb-3 text-sm text-foreground">
            Pin <span className="font-medium">/{chosen.name}</span> to…
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => pin('worktree')}
              className="rounded-md border border-border bg-secondary px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
            >
              This worktree
              <span className="block text-xs text-muted-foreground">Only in this worktree</span>
            </button>
            {canPinRepo && (
              <button
                type="button"
                onClick={() => pin('repo')}
                className="rounded-md border border-border bg-secondary px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
              >
                This repo
                <span className="block text-xs text-muted-foreground">
                  Every worktree of this repo
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back to skills
            </button>
          </div>
        </div>
      ) : (
        <>
          <CommandInput placeholder="Search skills to pin…" />
          <CommandList>
            <CommandEmpty>
              {skills.length === 0
                ? 'No skills available yet — send a message to start the session.'
                : 'No matching skills.'}
            </CommandEmpty>
            <CommandGroup heading="Skills">
              {skills.map((skill) => (
                <CommandItem
                  key={skill.name}
                  value={`${skill.name} ${skill.description}`}
                  onSelect={() => setChosen(skill)}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">/{skill.name}</span>
                    {skill.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {skill.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </>
      )}
    </CommandDialog>
  );
}
