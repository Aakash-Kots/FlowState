'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Folder, GitBranch, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_WORKSPACE_ID, type Project, type Workspace } from '@flowstate/shared';
import {
  loadProjects,
  openCreateWorktree,
  removeWorktree,
  selectWorktree,
  setAddOpen,
  useProjects,
} from '@/lib/projects';
import { useWorktreeDiffStat } from '@/lib/git';
import { projectName, shortenPath } from '@/lib/paths';
import { pickWorkingFolder, useWorkspace } from '@/lib/workspace';
import { AddProjectModal } from '../projects/AddProjectModal';
import { CreateWorktreeModal } from '../projects/CreateWorktreeModal';
import { CtaIconButton } from '../shared/CtaIconButton';
import { cn } from '../ui/cn';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '../ui/sidebar';

///////////////////
// Sub-components //
///////////////////

/** The FlowState logo mark — three flowing strokes suggesting motion/flow. */
function FlowStateMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 8c3.5-3.2 10-3.2 14 0"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M5 12c3.5-3.2 10-3.2 14 0"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M5 16c3.5-3.2 10-3.2 14 0"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

/** One worktree sub-tab: its branch, selectable, with a hover remove control. */
function WorktreeRow({ workspace }: { workspace: Workspace }) {
  const active = useWorkspace((s) => s.workspaceId) === workspace.id;
  const stat = useWorktreeDiffStat(workspace.id);
  const hasStat = !!stat && (stat.insertions > 0 || stat.deletions > 0);
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={active}>
        <button
          type="button"
          onClick={() => selectWorktree(workspace)}
          title={workspace.branch}
          className="group/wt w-full cursor-pointer"
        >
          <GitBranch className="size-4 shrink-0" />
          <span className="flex-1 truncate">{workspace.branch}</span>
          {/* Trailing slot: diff badge by default, remove control on hover (they
              overlap so the row width stays stable). */}
          <span className="relative flex shrink-0 items-center">
            {hasStat && (
              <span className="font-mono text-[10px] tabular-nums leading-none transition-opacity group-hover/wt:opacity-0">
                {stat.insertions > 0 && (
                  <span className="text-green-600 dark:text-green-500">+{stat.insertions}</span>
                )}
                {stat.deletions > 0 && (
                  <span className="ml-1 text-red-600 dark:text-red-500">-{stat.deletions}</span>
                )}
              </span>
            )}
            <span
              role="button"
              tabIndex={-1}
              aria-label="Remove worktree"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                void removeWorktree(workspace);
              }}
              className={cn(
                'rounded p-0.5 text-muted-foreground opacity-0 transition-colors hover:bg-accent hover:text-foreground group-hover/wt:opacity-100',
                hasStat && 'absolute right-0 top-1/2 -translate-y-1/2',
              )}
            >
              <Trash2 className="size-3" />
            </span>
          </span>
        </button>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

/** A project header row plus its nested worktree sub-tabs. */
function ProjectGroup({ project }: { project: Project }) {
  const worktrees = useProjects((s) => s.worktrees[project.id] ?? []);
  return (
    <>
      <SidebarMenuItem>
        {/* A non-interactive header: projects aren't a workspace you chat in —
            only their worktrees are selectable. */}
        <div
          className="flex h-auto w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm group-has-[[data-sidebar=menu-action]]/menu-item:pr-8"
          title={project.name}
        >
          <Folder className="size-4 shrink-0" />
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate font-medium">{project.name}</span>
            <span className="truncate font-mono text-xs text-sidebar-foreground/60">
              {shortenPath(project.localPath)}
            </span>
          </div>
        </div>
        <SidebarMenuAction showOnHover title="New worktree" onClick={() => openCreateWorktree(project.id)}>
          <Plus />
          <span className="sr-only">New worktree</span>
        </SidebarMenuAction>
      </SidebarMenuItem>
      <SidebarMenuSub className="mx-0 border-l-0 pl-4 pr-1">
        {worktrees.map((ws) => (
          <WorktreeRow key={ws.id} workspace={ws} />
        ))}
        <SidebarMenuSubItem>
          <SidebarMenuSubButton asChild>
            <button
              type="button"
              onClick={() => openCreateWorktree(project.id)}
              className="w-full cursor-pointer text-sidebar-foreground/60"
            >
              <Plus className="size-4 shrink-0" />
              <span className="truncate">New worktree</span>
            </button>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      </SidebarMenuSub>
    </>
  );
}

/** Fallback row for a working folder opened before projects existed. */
function FolderItem({ cwd }: { cwd: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="h-auto py-2"
        isActive
        tooltip={projectName(cwd)}
        onClick={() => void pickWorkingFolder()}
      >
        <Folder className="size-4 shrink-0" />
        <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
          <span className="truncate font-medium">{projectName(cwd)}</span>
          <span className="truncate font-mono text-xs text-sidebar-foreground/60">
            {shortenPath(cwd)}
          </span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** App sidebar: the projects the user has brought into FlowState + their worktrees. */
export function AppSidebar() {
  const cwd = useWorkspace((s) => s.cwd);
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const projects = useProjects((s) => s.projects);
  const [open, setOpen] = useState(true);

  // Hydrate the persisted project list (and each project's worktrees) once.
  useEffect(() => {
    void loadProjects();
  }, []);

  // A legacy working folder opened on the default workspace that isn't one of the
  // tracked projects. Worktrees are real workspaces shown under their project, so
  // they're never orphans — only fall back to this for the default workspace.
  const orphanCwd =
    workspaceId === DEFAULT_WORKSPACE_ID && cwd && !projects.some((p) => p.localPath === cwd)
      ? cwd
      : null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex aspect-square size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <FlowStateMark className="size-4" />
          </div>
          <span className="truncate text-sm font-semibold tracking-wide text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            FlowState
          </span>
        </div>
        <div className="px-1 group-data-[collapsible=icon]:px-0">
          <CtaIconButton icon={Plus} onClick={() => setAddOpen(true)}>
            Add Project
          </CtaIconButton>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <Collapsible open={open} onOpenChange={setOpen}>
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center">
                <ChevronRight
                  className={cn('mr-1 size-4 transition-transform', open && 'rotate-90')}
                />
                Projects
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {projects.map((project) => (
                    <ProjectGroup key={project.id} project={project} />
                  ))}
                  {orphanCwd && <FolderItem cwd={orphanCwd} />}
                  {projects.length === 0 && !orphanCwd && (
                    <SidebarMenuItem>
                      <div className="px-2 py-1.5 group-data-[collapsible=icon]:hidden">
                        <p className="text-xs text-sidebar-foreground/60">
                          No projects yet. Use “Add Project” above.
                        </p>
                      </div>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>
      <SidebarRail />
      <AddProjectModal />
      <CreateWorktreeModal />
    </Sidebar>
  );
}
