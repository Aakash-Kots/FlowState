'use client';

import { ChevronDown, ExternalLink, GitBranch, Plus, UserPlus } from 'lucide-react';
import { ClaudeSessionState, type LinearIssue, type LinearIssueRef } from '@flowstate/shared';
import {
  ensureWorkflowStates,
  refreshUsers,
  setIssueAssignee,
  setIssueState,
  useLinear,
} from '@/lib/linear';
import { openCreateWorktreeForIssue, useProjects } from '@/lib/projects';
import { trpc } from '@/lib/trpc';
import { selectWorkspace, useWorkspace } from '@/lib/workspace';
import { Combobox } from '../ui/combobox';
import { cn } from '../ui/cn';
import { Avatar, StateDot } from './atoms';

/////////////
// Helpers //
/////////////

/** Down-convert a browser issue to the small ref a linked worktree persists. */
function toRef(issue: LinearIssue): LinearIssueRef {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    branchName: issue.branchName,
    stateName: issue.state.name,
  };
}

/** Colour accent for a linked worktree's Claude session state. */
const CLAUDE_STATE_DOT: Record<ClaudeSessionState, string> = {
  [ClaudeSessionState.Idle]: 'bg-muted-foreground',
  [ClaudeSessionState.Running]: 'bg-success',
  [ClaudeSessionState.Waiting]: 'bg-warn',
  [ClaudeSessionState.Error]: 'bg-danger',
};

///////////////////
// Sub-components //
///////////////////

/** Status dropdown — moves the issue between its team's workflow states. */
function StateControl({ issue }: { issue: LinearIssue }) {
  const states = useLinear((s) => s.workflowStatesByTeam[issue.teamId] ?? []);
  return (
    <Combobox
      items={states}
      getKey={(st) => st.id}
      getFilterText={(st) => st.name}
      isSelected={(st) => st.id === issue.state.id}
      onSelect={(st) => void setIssueState(issue.id, st.id)}
      onOpen={() => void ensureWorkflowStates(issue.teamId)}
      placeholder="Search states…"
      emptyText="No workflow states"
      triggerClassName="gap-1.5 rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted hover:text-neutral-100"
      trigger={
        <>
          <StateDot color={issue.state.color} />
          <span className="max-w-[10rem] truncate text-neutral-200">{issue.state.name}</span>
          <ChevronDown className="size-3 opacity-70" />
        </>
      }
      renderItem={(st) => (
        <>
          <StateDot color={st.color} />
          <span className="min-w-0 flex-1 truncate text-neutral-200">{st.name}</span>
        </>
      )}
    />
  );
}

/** Assignee dropdown (+ a one-click "Assign to me"). */
function AssigneeControl({ issue }: { issue: LinearIssue }) {
  const users = useLinear((s) => s.users);
  const viewer = useLinear((s) => s.viewer);
  const canAssignSelf = viewer && issue.assignee?.id !== viewer.id;

  return (
    <div className="flex items-center gap-1.5">
      <Combobox
        items={users}
        getKey={(u) => u.id}
        getFilterText={(u) => `${u.displayName} ${u.name}`}
        isSelected={(u) => u.id === issue.assignee?.id}
        onSelect={(u) => void setIssueAssignee(issue.id, u.id)}
        onOpen={() => void refreshUsers()}
        placeholder="Search users…"
        emptyText="No users"
        clear={{
          label: 'Unassigned',
          active: !issue.assignee,
          onClear: () => void setIssueAssignee(issue.id, null),
        }}
        triggerClassName="gap-1.5 rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted hover:text-neutral-100"
        trigger={
          issue.assignee ? (
            <>
              <Avatar
                name={issue.assignee.name}
                avatarUrl={issue.assignee.avatarUrl}
                className="size-4"
              />
              <span className="max-w-[10rem] truncate text-neutral-200">{issue.assignee.name}</span>
              <ChevronDown className="size-3 opacity-70" />
            </>
          ) : (
            <>
              <span className="text-muted-foreground">Unassigned</span>
              <ChevronDown className="size-3 opacity-70" />
            </>
          )
        }
        renderItem={(u) => (
          <>
            <Avatar name={u.name} avatarUrl={u.avatarUrl} className="size-4" />
            <span className="min-w-0 flex-1 truncate text-neutral-200">{u.displayName}</span>
          </>
        )}
      />
      {canAssignSelf && (
        <button
          type="button"
          onClick={() => void setIssueAssignee(issue.id, viewer.id)}
          title="Assign to me"
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-neutral-100"
        >
          <UserPlus className="size-3" />
          Me
        </button>
      )}
    </div>
  );
}

/** The worktrees currently linked to this issue (clickable to switch). */
function LinkedWorktrees({ issueId }: { issueId: string }) {
  const linked = useLinear((s) => s.linkedWorktrees.filter((w) => w.issueId === issueId));
  if (linked.length === 0) {
    return <p className="text-xs text-muted-foreground">No linked worktrees yet.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      {linked.map((w) => (
        <button
          key={w.workspaceId}
          type="button"
          onClick={() => void selectWorkspace(w.workspaceId)}
          className="group flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
        >
          <span className={cn('size-2 shrink-0 rounded-full', CLAUDE_STATE_DOT[w.claudeState])} />
          <span className="min-w-0 flex-1 truncate text-neutral-200">{w.name}</span>
          <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
            <GitBranch className="size-3" />
            <span className="max-w-[12rem] truncate">{w.branch}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

////////////
// Export //
////////////

/**
 * The right column: the selected issue's title, workflow-state + assignee
 * controls, the worktrees linked to it, and a "Create worktree" action that opens
 * the New-Worktree modal pre-linked to this issue (under the current project).
 */
export function IssueDetail() {
  const issue = useLinear((s) => s.issues.find((i) => i.id === s.selectedIssueId) ?? null);

  // The project of the worktree we're viewing — where a new linked worktree lands.
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const projectId = useProjects((s) => {
    for (const list of Object.values(s.worktrees)) {
      const match = list.find((w) => w.id === workspaceId);
      if (match) return match.projectId;
    }
    return null;
  });

  if (!issue) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Select an issue to view it.
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
      {/* Header */}
      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{issue.identifier}</span>
        <button
          type="button"
          onClick={() => void trpc().app.openExternal.mutate({ url: issue.url })}
          title="Open in Linear"
          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </div>
      <h2 className="mb-3 text-base font-semibold text-neutral-100">{issue.title}</h2>

      {/* Description (Linear markdown, shown as-is for v1) */}
      {issue.description?.trim() && (
        <p className="mb-4 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {issue.description.trim()}
        </p>
      )}

      {/* Actions */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
        <StateControl issue={issue} />
        <AssigneeControl issue={issue} />
      </div>

      {/* Linked worktrees */}
      <div className="mb-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Linked worktrees
        </h3>
        <LinkedWorktrees issueId={issue.id} />
      </div>

      <button
        type="button"
        disabled={!projectId}
        onClick={() => projectId && openCreateWorktreeForIssue(projectId, toRef(issue))}
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        title={projectId ? 'Create a worktree linked to this issue' : 'Open a project to create a worktree'}
      >
        <Plus className="size-3.5" />
        Create worktree
      </button>
    </div>
  );
}
