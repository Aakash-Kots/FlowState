'use client';

import { useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { FolderOpen, Lock, Search, X } from 'lucide-react';
import Link from 'next/link';
import type { GithubRepo } from '@flowstate/shared';
import { useOnboarding } from '@/lib/onboarding';
import { addLocalProject, addProject, loadRepos, setAddOpen, useProjects } from '@/lib/projects';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

/////////////
// Helpers //
/////////////

/** A selectable repository row. */
function RepoRow({
  repo,
  selected,
  onSelect,
}: {
  repo: GithubRepo;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
        selected
          ? 'border-ring/60 bg-muted'
          : 'border-transparent hover:border-border hover:bg-muted/60',
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <span className="truncate">{repo.fullName}</span>
        {repo.private && <Lock className="size-3 shrink-0 text-muted-foreground" />}
      </span>
      {repo.description && (
        <span className="truncate text-xs text-muted-foreground">{repo.description}</span>
      )}
    </button>
  );
}

/** The list body: loading / error / empty / repo rows. */
function RepoList({
  repos,
  loading,
  error,
  query,
  selected,
  onSelect,
}: {
  repos: GithubRepo[];
  loading: boolean;
  error: string | null;
  query: string;
  selected: string | null;
  onSelect: (repo: GithubRepo) => void;
}) {
  if (loading) {
    return <p className="px-1 py-6 text-center text-sm text-muted-foreground">Loading repositories…</p>;
  }
  if (error) {
    return <p className="px-1 py-6 text-center text-sm text-warn">{error}</p>;
  }
  const filtered = query
    ? repos.filter((r) => r.fullName.toLowerCase().includes(query.toLowerCase()))
    : repos;
  if (filtered.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted-foreground">
        {repos.length === 0 ? 'No repositories found.' : 'No matches.'}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {filtered.map((repo) => (
        <RepoRow
          key={repo.fullName}
          repo={repo}
          selected={selected === repo.fullName}
          onSelect={() => onSelect(repo)}
        />
      ))}
    </div>
  );
}

/////////////////
// Modal shell //
/////////////////

/** The "Add Project" modal: pick a repo from the linked GitHub account to clone. */
export function AddProjectModal() {
  const open = useProjects((s) => s.addOpen);
  const repos = useProjects((s) => s.repos);
  const reposLoading = useProjects((s) => s.reposLoading);
  const reposError = useProjects((s) => s.reposError);
  const adding = useProjects((s) => s.adding);
  const addError = useProjects((s) => s.addError);
  const githubConnected = useOnboarding((s) => s.githubConnected);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<GithubRepo | null>(null);

  // Load repos each time the modal opens with a connected account; reset choices.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(null);
    if (githubConnected) void loadRepos();
  }, [open, githubConnected]);

  const selectedName = useMemo(() => selected?.fullName ?? null, [selected]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setAddOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-background p-5 shadow-2xl shadow-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="mb-1 flex items-center justify-between">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              Add Project
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {githubConnected ? (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Pick a repository from your linked GitHub account — FlowState clones it locally and
                opens it as your project — or add a folder from your computer.
              </p>

              <div className="mb-3 flex items-center gap-2 rounded-md border border-input px-2.5">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search repositories…"
                  className="h-9 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <RepoList
                  repos={repos}
                  loading={reposLoading}
                  error={reposError}
                  query={query}
                  selected={selectedName}
                  onSelect={setSelected}
                />
              </div>
            </>
          ) : (
            <div className="py-6 text-center">
              <p className="mb-1 text-sm text-muted-foreground">
                Add a folder from your computer, or connect GitHub to clone a repository.
              </p>
              <Link
                href="/connect"
                onClick={() => setAddOpen(false)}
                className="text-sm text-foreground underline underline-offset-4 hover:text-neutral-200"
              >
                Go to Connect
              </Link>
            </div>
          )}

          {addError && <p className="mt-3 text-sm text-warn">{addError}</p>}

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => void addLocalProject()} disabled={adding}>
              <FolderOpen className="size-4" />
              Local folder…
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={adding}>
                Cancel
              </Button>
              {githubConnected && (
                <Button
                  onClick={() => selected && void addProject(selected)}
                  disabled={!selected || adding}
                >
                  {adding ? 'Cloning…' : 'Add'}
                </Button>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
