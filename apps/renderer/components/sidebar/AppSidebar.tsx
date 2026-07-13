'use client';

import { useState } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import { pickWorkingFolder, useWorkspace } from '@/lib/workspace';
import { Button } from '../ui/Button';
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

/** The current project row: folder name over its shortened path; click to change. */
function ProjectItem({ cwd }: { cwd: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="h-auto py-2"
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

/** App sidebar: the current project / worktree the user is working in. */
export function AppSidebar() {
  const cwd = useWorkspace((s) => s.cwd);
  const [open, setOpen] = useState(true);

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
      </SidebarHeader>
      <SidebarContent>
        <Collapsible open={open} onOpenChange={setOpen}>
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center">
                <ChevronRight
                  className={cn('mr-1 size-4 transition-transform', open && 'rotate-90')}
                />
                Project
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {cwd ? (
                    <ProjectItem cwd={cwd} />
                  ) : (
                    <SidebarMenuItem>
                      <div className="px-2 py-1.5">
                        <p className="mb-2 text-xs text-sidebar-foreground/60">No folder open.</p>
                        <Button onClick={() => void pickWorkingFolder()}>Pick a folder</Button>
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
    </Sidebar>
  );
}
