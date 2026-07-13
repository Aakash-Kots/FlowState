'use client';

import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { createWorktree, setCreateOpen, useProjects } from '@/lib/projects';
import { Button } from '@/components/ui/Button';

/////////////
// Helpers //
/////////////

const INPUT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/60';

/** A labelled field wrapper. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-foreground">
        {label}
        {hint && <span className="ml-1 font-normal text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/////////////////
// Modal shell //
/////////////////

/**
 * The "New worktree" modal: create a git worktree (a sub-tab) under a project by
 * picking a base branch and, optionally, a first prompt. The worktree starts
 * "Untitled" and auto-names itself from its first chat.
 */
export function CreateWorktreeModal() {
  const open = useProjects((s) => s.createOpen);
  const projectId = useProjects((s) => s.createProjectId);
  const creating = useProjects((s) => s.creating);
  const error = useProjects((s) => s.createError);
  const branches = useProjects((s) => s.branches);
  const project = useProjects((s) => s.projects.find((p) => p.id === s.createProjectId) ?? null);

  const [baseRef, setBaseRef] = useState('');
  const [prompt, setPrompt] = useState('');

  // Reset the form each time the modal opens, defaulting to the project's branch.
  useEffect(() => {
    if (!open) return;
    setBaseRef(project?.defaultBranch ?? '');
    setPrompt('');
  }, [open, projectId, project?.defaultBranch]);

  const canSubmit = !creating;
  const submit = () => {
    if (!canSubmit) return;
    void createWorktree({ baseRef, initialPrompt: prompt });
  };

  // The base branch may not be in the fetched list yet (or ever); include it so
  // the select always reflects the current value.
  const options = branches.includes(baseRef) || !baseRef ? branches : [baseRef, ...branches];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setCreateOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-background p-5 shadow-2xl shadow-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              New worktree{project ? ` · ${project.name}` : ''}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          <Field label="Prompt" hint="optional — Claude starts on this right away">
            <textarea
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder="What should Claude start on in this worktree?"
              rows={3}
              className={`${INPUT_CLASS} h-auto resize-none py-2`}
            />
          </Field>

          <Field label="Branch off">
            <select
              value={baseRef}
              onChange={(e) => setBaseRef(e.target.value)}
              className={INPUT_CLASS}
            >
              {options.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>

          {error && <p className="text-sm text-warn">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {creating ? 'Creating…' : 'Create worktree'}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
