'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, ChevronRight, Folder, GitBranch, Plug, Plus, Settings, Trash2 } from 'lucide-react';
import { DEFAULT_WORKSPACE_ID, type Project, type Workspace } from '@flowstate/shared';
import {
  archiveWorktree,
  loadProjects,
  openCreateWorktree,
  removeWorktree,
  selectWorktree,
  setAddOpen,
  useProjects,
} from '@/lib/projects';
import { useWorktreeDiffStat, useWorktreePrMerged } from '@/lib/git';
import { projectName } from '@/lib/paths';
import { setSettingsOpen, useSettings } from '@/lib/settings';
import { useWorktreeState, useWorktreeUnread } from '@/lib/tabStates';
import { pickWorkingFolder, useWorkspace } from '@/lib/workspace';
import { AddProjectModal } from '../projects/AddProjectModal';
import { CreateWorktreeModal } from '../projects/CreateWorktreeModal';
import { CtaIconButton } from '../shared/CtaIconButton';
import { cn } from '../ui/cn';
import { StateIndicator } from '../ui/StateIndicator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
  SidebarSeparator,
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

/**
 * A project's avatar: the GitHub owner's picture, falling back to the linked
 * user's own avatar, then a folder icon — advancing past any source that 404s or
 * fails to load (e.g. a local repo with no owner, or offline).
 */
function ProjectAvatar({ owner, className }: { owner: string; className?: string }) {
  const viewer = useProjects((s) => s.viewer);
  const [failed, setFailed] = useState(0);
  const sources = [
    owner ? `https://github.com/${owner}.png?size=64` : null,
    viewer?.avatarUrl ?? null,
  ].filter((s): s is string => !!s);
  const src = sources[failed];
  if (!src) {
    return <Folder className={cn('size-5 shrink-0', className)} />;
  }
  return (
    // A tiny remote avatar in a statically-exported Electron app — `next/image`
    // buys nothing here (optimization is off) and can't take a bare remote URL.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={cn('size-5 shrink-0 rounded-sm object-cover', className)}
      onError={() => setFailed((n) => n + 1)}
    />
  );
}

/** One worktree sub-tab: its branch, selectable, with a hover remove control. */
function WorktreeRow({ workspace }: { workspace: Workspace }) {
  const active = useWorkspace((s) => s.workspaceId) === workspace.id;
  const stat = useWorktreeDiffStat(workspace.id);
  const hasStat = !!stat && (stat.insertions > 0 || stat.deletions > 0);
  const state = useWorktreeState(workspace.id);
  const unread = useWorktreeUnread(workspace.id);
  // The Archive control appears only once the branch's PR is merged.
  const merged = useWorktreePrMerged(workspace.id);
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={active}>
        <button
          type="button"
          onClick={() => selectWorktree(workspace)}
          title={workspace.branch}
          className="group/wt w-full cursor-pointer pl-6"
        >
          <GitBranch className="size-4 shrink-0" />
          <span className="flex-1 truncate">{workspace.branch}</span>
          <StateIndicator state={state} unread={unread} />
          {/* Trailing slot: diff badge by default, hover controls (archive when
              merged, remove) on hover — they overlap so row width stays stable. */}
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
              className={cn(
                'flex items-center gap-0.5 opacity-0 transition-opacity group-hover/wt:opacity-100',
                hasStat && 'absolute right-0 top-1/2 -translate-y-1/2',
              )}
            >
              {merged && (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Archive worktree"
                  title="Archive (PR merged) — deletes after the retention delay"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    void archiveWorktree(workspace);
                  }}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Archive className="size-3" />
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
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Trash2 className="size-3" />
              </span>
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
        {/* The project header itself is the "new worktree" affordance: projects
            aren't a workspace you chat in, so clicking the row starts a worktree
            (the same as the hover "+"). */}
        <SidebarMenuButton
          size="lg"
          title={project.name}
          onClick={() => openCreateWorktree(project.id)}
        >
          <ProjectAvatar owner={project.owner} className="size-6" />
          <span className="truncate font-medium group-data-[collapsible=icon]:hidden">
            {project.name}
          </span>
        </SidebarMenuButton>
        <SidebarMenuAction
          showOnHover
          title="New worktree"
          onClick={() => openCreateWorktree(project.id)}
        >
          <Plus />
          <span className="sr-only">New worktree</span>
        </SidebarMenuAction>
      </SidebarMenuItem>
      <SidebarMenuSub className="mx-0 border-l-0 px-0">
        {worktrees.map((ws) => (
          <WorktreeRow key={ws.id} workspace={ws} />
        ))}
        <SidebarMenuSubItem>
          <SidebarMenuSubButton asChild>
            <button
              type="button"
              onClick={() => openCreateWorktree(project.id)}
              className="w-full cursor-pointer pl-6 text-sidebar-foreground/60"
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
        isActive
        tooltip={projectName(cwd)}
        onClick={() => void pickWorkingFolder()}
      >
        <ProjectAvatar owner="" />
        <span className="truncate font-medium group-data-[collapsible=icon]:hidden">
          {projectName(cwd)}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** App sidebar: the projects the user has brought into FlowState + their worktrees. */
export function AppSidebar() {
  const cwd = useWorkspace((s) => s.cwd);
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const projects = useProjects((s) => s.projects);
  const settingsOpen = useSettings((s) => s.settingsOpen);
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
      <SidebarFooter>
        <SidebarSeparator className="mx-0" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setSettingsOpen(!settingsOpen)}
              isActive={settingsOpen}
              tooltip="Settings"
            >
              <Settings className="size-4 shrink-0" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Connect">
              <Link href="/connect">
                <Plug className="size-4 shrink-0" />
                <span>Connect</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      <AddProjectModal />
      <CreateWorktreeModal />
    </Sidebar>
  );
}
