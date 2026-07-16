'use client';

import { useEffect, useState } from 'react';
import { FileDown, FolderInput } from 'lucide-react';
import type { ImportableSkill, SkillOption } from '@flowstate/shared';
import { trpc } from '@/lib/trpc';
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
 * The "pin a skill" flow: a searchable modal of every discovered skill (pinned
 * in place with a scope choice) plus skills that can be *imported* from another
 * project / the global config / an arbitrary file — imports always land in this
 * worktree, so they skip the scope step. `canPinRepo` is false when the active
 * workspace has no parent project, hiding the repo option.
 */
export function SkillPicker({
  open,
  onOpenChange,
  skills,
  canPinRepo,
  workspaceId,
  onPin,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: SkillOption[];
  canPinRepo: boolean;
  workspaceId: string | null;
  onPin: (skill: SkillOption, scope: PinScope) => void;
  onImport: (sourcePath: string) => void;
}) {
  const [chosen, setChosen] = useState<SkillOption | null>(null);
  const [importable, setImportable] = useState<ImportableSkill[]>([]);

  // Fetch importable skills each time the picker opens, so freshly-cloned
  // projects and newly-added global skills show up without a reload.
  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    trpc()
      .skills.listImportable.query({ workspaceId })
      .then((items) => {
        if (!cancelled) setImportable(items);
      })
      .catch(() => {
        if (!cancelled) setImportable([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setChosen(null);
  };

  const pin = (scope: PinScope) => {
    if (chosen) onPin(chosen, scope);
    close(false);
  };

  // Import a discovered file or one picked from disk — always worktree-scoped.
  const importFrom = (sourcePath: string) => {
    onImport(sourcePath);
    close(false);
  };

  const pickFile = () => {
    void trpc()
      .skills.pickFile.mutate()
      .then((path) => {
        if (path) importFrom(path);
      });
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
          <CommandInput placeholder="Search skills to pin or import…" />
          <CommandList>
            <CommandEmpty>
              {skills.length === 0
                ? 'No skills available yet — send a message to start the session.'
                : 'No matching skills.'}
            </CommandEmpty>
            {skills.length > 0 && (
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
            )}
            <CommandGroup heading="Import into this worktree">
              {importable.map((skill) => (
                <CommandItem
                  key={skill.sourcePath}
                  value={`${skill.name} ${skill.description ?? ''} ${skill.sourceLabel}`}
                  onSelect={() => importFrom(skill.sourcePath)}
                >
                  <FileDown className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">/{skill.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {skill.description ? `${skill.description} · ` : ''}
                      from {skill.sourceLabel}
                    </span>
                  </div>
                </CommandItem>
              ))}
              <CommandItem value="choose a file from disk import" onSelect={pickFile}>
                <FolderInput className="size-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">Choose a file…</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </>
      )}
    </CommandDialog>
  );
}
