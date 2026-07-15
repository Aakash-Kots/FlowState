'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, GitBranch, HelpCircle, Plug, Plus, Search, Settings, Trash2 } from 'lucide-react';
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
import { setHelpOpen, setPaletteOpen } from '@/lib/shortcuts/store';
import { useWorktreeState, useWorktreeUnread } from '@/lib/tabStates';
import { pickWorkingFolder, useWorkspace } from '@/lib/workspace';
import { AddProjectModal } from '../projects/AddProjectModal';
import { CreateWorktreeModal } from '../projects/CreateWorktreeModal';
import { ProjectAvatar } from '../projects/ProjectAvatar';
import { cn } from '../ui/cn';
import { DropdownItem, DropdownMenu } from '../ui/dropdown-menu';
import { Kbd } from '../ui/kbd';
import { StateIndicator } from '../ui/StateIndicator';
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
  SidebarTrigger,
} from '../ui/sidebar';

///////////////////
// Sub-components //
///////////////////

/** The linked GitHub account — avatar + display name, with a menu to the Connect screen. */
function UserIdentity() {
  const viewer = useProjects((s) => s.viewer);
  const router = useRouter();
  const label = viewer?.name ?? viewer?.login ?? 'Connect account';
  const initial = label.charAt(0).toUpperCase();
  return (
    <DropdownMenu
      placement="bottom"
      align="start"
      triggerClassName="flex w-full items-center gap-2 p-1.5 text-sidebar-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1"
      trigger={
        <>
          {viewer?.avatarUrl ? (
            // Bare remote avatar in a statically-exported Electron app — `next/image`
            // buys nothing here (optimization is off) and can't take a bare remote URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viewer.avatarUrl}
              alt=""
              className="size-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
              {initial}
            </span>
          )}
          <span className="flex-1 truncate text-left text-sm font-semibold group-data-[collapsible=icon]:hidden">
            {label}
          </span>
        </>
      }
    >
      {(close) => (
        <DropdownItem
          onSelect={() => {
            close();
            router.push('/connect');
          }}
        >
          <Plug className="size-4 shrink-0" />
          <span>Connect</span>
        </DropdownItem>
      )}
    </DropdownMenu>
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
        <div className="flex items-center px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <SidebarTrigger />
        </div>
        <UserIdentity />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Create" onClick={() => setAddOpen(true)}>
              <Plus className="size-4 shrink-0" />
              <span>Create</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Search" onClick={() => setPaletteOpen(true)}>
              <Search className="size-4 shrink-0" />
              <span>Search</span>
              <Kbd keys={['⌘', 'K']} className="ml-auto group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarSeparator className="mx-0" />
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
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
                      No projects yet. Use “Create” above.
                    </p>
                  </div>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator className="mx-0" />
        <div className="flex items-center justify-end gap-1 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <button
            type="button"
            title="Keyboard shortcuts"
            onClick={() => setHelpOpen(true)}
            className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <HelpCircle className="size-4" />
            <span className="sr-only">Keyboard shortcuts</span>
          </button>
          <button
            type="button"
            title="Settings"
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={cn(
              'flex size-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground',
              settingsOpen && 'bg-sidebar-accent text-sidebar-foreground',
            )}
          >
            <Settings className="size-4" />
            <span className="sr-only">Settings</span>
          </button>
        </div>
      </SidebarFooter>
      <SidebarRail />
      <AddProjectModal />
      <CreateWorktreeModal />
    </Sidebar>
  );
}
