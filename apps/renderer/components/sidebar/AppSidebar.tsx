'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Folder, Plus } from 'lucide-react';
import type { Project } from '@flowstate/shared';
import { loadProjects, openProject, setAddOpen, useProjects } from '@/lib/projects';
import { pickWorkingFolder, useWorkspace } from '@/lib/workspace';
import { AddProjectModal } from '../projects/AddProjectModal';
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
  SidebarMenuButton,
  SidebarMenuItem,
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

/** A persisted project row: name over its shortened path; click to make active. */
function ProjectRow({ project, active }: { project: Project; active: boolean }) {
  return (
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
    </SidebarMenuItem>
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

/** App sidebar: the projects the user has brought into FlowState. */
export function AppSidebar() {
  const cwd = useWorkspace((s) => s.cwd);
  const projects = useProjects((s) => s.projects);
  const [open, setOpen] = useState(true);

  // Hydrate the persisted project list once for the app's lifetime.
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
                    <ProjectRow key={project.id} project={project} active={project.localPath === cwd} />
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
    </Sidebar>
  );
}
