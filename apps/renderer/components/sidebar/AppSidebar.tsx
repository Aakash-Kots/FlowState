'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Folder, GitBranch, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_WORKSPACE_ID, type Project, type Workspace } from '@flowstate/shared';
import {
  loadProjects,
  openCreateWorktree,
  openProject,
  removeWorktree,
  selectWorktree,
  setAddOpen,
  useProjects,
} from '@/lib/projects';
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

/////////////
// Helpers //
/////////////

/** The folder's basename — used as the project's display name. */
function projectName(cwd: string): string {
  return cwd.split('/').filter(Boolean).pop() ?? cwd;
}

function shortenPath(path: string): string {
  const home = path.match(/^\/(?:Users|home)\/[^/]+/);
  return home ? path.replace(home[0], '~') : path;
}

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
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={active}>
        <button
          type="button"
          onClick={() => selectWorktree(workspace)}
          className="group/wt w-full cursor-pointer"
        >
          <GitBranch className="size-4 shrink-0" />
          <span className="flex-1 truncate">{workspace.branch}</span>
          <span
            role="button"
            tabIndex={-1}
            aria-label="Remove worktree"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void removeWorktree(workspace);
            }}
            className="rounded p-0.5 text-muted-foreground opacity-0 transition-colors hover:bg-edge hover:text-foreground group-hover/wt:opacity-100"
          >
            <Trash2 className="size-3" />
          </span>
        </button>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

/** A project header row plus its nested worktree sub-tabs. */
function ProjectGroup({ project, active }: { project: Project; active: boolean }) {
  const worktrees = useProjects((s) => s.worktrees[project.id] ?? []);
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          className="h-auto py-2"
          isActive={active}
          tooltip={project.name}
          onClick={() => void openProject(project)}
        >
          <Folder className="size-4 shrink-0" />
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate font-medium">{project.name}</span>
            <span className="truncate font-mono text-xs text-sidebar-foreground/60">
              {shortenPath(project.localPath)}
            </span>
          </div>
        </SidebarMenuButton>
        <SidebarMenuAction showOnHover title="New worktree" onClick={() => openCreateWorktree(project.id)}>
          <Plus />
          <span className="sr-only">New worktree</span>
        </SidebarMenuAction>
      </SidebarMenuItem>
      <SidebarMenuSub>
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

  // Any active working folder that isn't one of the tracked projects.
  const orphanCwd = cwd && !projects.some((p) => p.localPath === cwd) ? cwd : null;

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
                    <ProjectGroup
                      key={project.id}
                      project={project}
                      active={workspaceId === DEFAULT_WORKSPACE_ID && project.localPath === cwd}
                    />
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
