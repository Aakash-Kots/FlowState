'use client';

import { Folder, FolderPlus, GitBranch, Plus } from 'lucide-react';
import type { Project } from '@flowstate/shared';
import { openCreateWorktree, selectWorktree, setAddOpen, useProjects } from '@/lib/projects';
import { shortenPath } from '@/lib/paths';
import { Button } from '@/components/ui/Button';

///////////////////
// Sub-components //
///////////////////

/**
 * One project tile. Selecting a project jumps into its most-recent worktree, or —
 * if it has none yet — opens the New Worktree flow so you land in a workspace.
 */
function ProjectCard({ project }: { project: Project }) {
  const worktrees = useProjects((s) => s.worktrees[project.id] ?? []);
  const count = worktrees.length;
  const open = () => {
    if (worktrees[0]) selectWorktree(worktrees[0]);
    else openCreateWorktree(project.id);
  };
  return (
    <button
      type="button"
      onClick={open}
      className="group flex min-w-0 flex-col gap-3 rounded-xl border border-edge bg-surface p-4 text-left transition-colors hover:border-edge/80 hover:bg-raised focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-raised text-muted-foreground transition-colors group-hover:text-foreground">
          <Folder className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {shortenPath(project.localPath)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <GitBranch className="size-3.5" />
        {count > 0 ? (
          <span>
            {count} worktree{count === 1 ? '' : 's'}
          </span>
        ) : (
          <span>New worktree</span>
        )}
      </div>
    </button>
  );
}

/** The dashed "add another project" tile that sits at the end of the grid. */
function AddProjectCard() {
  return (
    <button
      type="button"
      onClick={() => setAddOpen(true)}
      className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge p-4 text-sm font-medium text-muted-foreground transition-colors hover:border-edge/80 hover:bg-raised hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
    >
      <Plus className="size-5" />
      Add project
    </button>
  );
}

/////////////////
// Main export //
/////////////////

/**
 * The default landing view shown whenever no worktree is selected: pick a project
 * to start working in (grid), or add a new one. Replaces the empty default-workspace
 * chat so projects/worktrees are the only way into a session.
 */
export function ProjectSelector() {
  const projects = useProjects((s) => s.projects);

  if (projects.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-base px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-surface text-muted-foreground">
          <FolderPlus className="size-7" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">No projects yet</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add a GitHub repo or a local folder to start working in worktrees.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add project
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-base">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-6 space-y-1">
          <h1 className="text-lg font-semibold text-foreground">Select a project</h1>
          <p className="text-sm text-muted-foreground">
            Pick a project to jump into its latest worktree, or start a new one.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
          <AddProjectCard />
        </div>
      </div>
    </div>
  );
}
