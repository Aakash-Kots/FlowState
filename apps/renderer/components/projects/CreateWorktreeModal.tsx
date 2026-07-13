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
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
 * The "New worktree" modal: create a git worktree (a sub-tab) on its own branch
 * under a project, optionally seeding its first Claude session with a prompt.
 */
export function CreateWorktreeModal() {
  const open = useProjects((s) => s.createOpen);
  const projectId = useProjects((s) => s.createProjectId);
  const creating = useProjects((s) => s.creating);
  const error = useProjects((s) => s.createError);
  const project = useProjects((s) => s.projects.find((p) => p.id === s.createProjectId) ?? null);

  const [branch, setBranch] = useState('');
  const [baseRef, setBaseRef] = useState('');
  const [prompt, setPrompt] = useState('');

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setBranch('');
    setBaseRef('');
    setPrompt('');
  }, [open, projectId]);

  const canSubmit = branch.trim().length > 0 && !creating;
  const submit = () => {
    if (!canSubmit) return;
    void createWorktree({ branch, baseRef, initialPrompt: prompt });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setCreateOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-edge bg-base p-5 shadow-2xl shadow-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              New worktree{project ? ` · ${project.name}` : ''}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          <p className="text-xs text-muted-foreground">
            Creates a git worktree on a new branch and links this project&apos;s{' '}
            <code className="text-foreground">.env</code> files into it.
          </p>

          <Field label="Branch">
            <input
              autoFocus
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="feature/my-change"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Base ref" hint={`optional — defaults to ${project?.defaultBranch ?? 'the default branch'}`}>
            <input
              value={baseRef}
              onChange={(e) => setBaseRef(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={project?.defaultBranch ?? 'main'}
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="First prompt" hint="optional">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should Claude start on in this worktree?"
              rows={3}
              className={`${INPUT_CLASS} h-auto resize-none py-2`}
            />
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
