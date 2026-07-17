'use client';

import { useEffect } from 'react';
import { ChevronDown, GitBranch, X } from 'lucide-react';
import { loadBranches, saveProjectBaseBranch, useProjects } from '@/lib/projects';
import { setProjectSettingsOpen } from '@/lib/settings';
import { Section, SettingRow } from '@/components/settings/SettingsLayout';
import { Combobox } from '../ui/combobox';
import { ProjectAvatar } from './ProjectAvatar';

/////////////////
// Main export //
/////////////////

/**
 * The per-repo settings surface, rendered full-screen in place of the workspace
 * body when a project's settings page is open. Currently exposes the base branch
 * new worktrees are cut from; closes on Esc or the header ✕.
 */
export function ProjectSettingsPage({ projectId }: { projectId: string }) {
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId) ?? null);
  const branches = useProjects((s) => s.branches);
  const branchesLoading = useProjects((s) => s.branchesLoading);

  // Load this project's branches once so the picker has choices.
  useEffect(() => {
    void loadBranches(projectId);
  }, [projectId]);

  // Esc closes the page — a familiar exit for a modal-like full surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProjectSettingsOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A project can be removed while its settings page is open — close it out.
  useEffect(() => {
    if (!project) setProjectSettingsOpen(null);
  }, [project]);

  if (!project) return null;

  const baseBranch = project.worktreeBaseBranch;
  // Always include the current override so the picker reflects it even before the
  // branch list loads (or if the branch no longer exists locally).
  const options =
    baseBranch && !branches.includes(baseBranch) ? [baseBranch, ...branches] : branches;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProjectAvatar owner={project.owner} className="size-5 shrink-0 rounded" />
          <h1 className="truncate text-sm font-semibold text-foreground">
            {project.name} · Settings
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setProjectSettingsOpen(null)}
          title="Close settings"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
          <span className="sr-only">Close settings</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-8">
          <Section title="Worktrees">
            <SettingRow
              title="Base branch"
              description={`Branch new worktrees are cut from. Defaults to the repo's default branch (${project.defaultBranch}).`}
              control={
                <Combobox
                  placement="bottom"
                  align="end"
                  triggerClassName="gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-neutral-100"
                  trigger={
                    <>
                      <GitBranch className="h-3.5 w-3.5 opacity-70" />
                      <span className="max-w-[14rem] truncate">
                        {baseBranch ?? `${project.defaultBranch} (default)`}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-70" />
                    </>
                  }
                  items={options}
                  getKey={(b) => b}
                  getFilterText={(b) => b}
                  isSelected={(b) => b === baseBranch}
                  onSelect={(b) => void saveProjectBaseBranch(projectId, b)}
                  placeholder="Search branches…"
                  emptyText="No branches"
                  loading={branchesLoading}
                  renderItem={(b) => <span className="truncate">{b}</span>}
                  clear={{
                    label: `Use repo default (${project.defaultBranch})`,
                    active: baseBranch === null,
                    onClear: () => void saveProjectBaseBranch(projectId, null),
                  }}
                />
              }
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
