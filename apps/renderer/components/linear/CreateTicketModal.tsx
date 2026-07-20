'use client';

import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronDown, Tag, UserPlus, X } from 'lucide-react';
import { type LinearLabel } from '@flowstate/shared';
import {
  createTicket,
  ensureViewer,
  ensureWorkflowStates,
  issueToRef,
  refreshLabels,
  refreshProjects,
  refreshTeams,
  refreshUsers,
  setCreateTicketOpen,
  surfacedTeams,
  useLinear,
} from '@/lib/linear';
import { openCreateWorktreeForIssue, useCurrentProjectId } from '@/lib/projects';
import { useSettings } from '@/lib/settings';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Combobox } from '@/components/ui/combobox';
import { ComposerEditor, type ComposerEditorHandle } from '@/components/chat/ComposerEditor';
import { Avatar, StateDot } from './atoms';
import { PRIORITY_OPTIONS, PriorityIcon, priorityLabel } from './PriorityIcon';

///////////////
// Constants //
///////////////

const TRIGGER =
  'gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-neutral-100';

////////////
// Export //
////////////

/**
 * The "New ticket" modal — creates a Linear issue with full parity (title,
 * description, team, status, assignee, priority, project, labels) and can chain
 * into the New-Worktree flow. Mirrors `CreateWorktreeModal`'s dialog shell; open
 * state + submission live in the Linear store. Team drives the status/project/
 * label/assignee scoping.
 */
export function CreateTicketModal() {
  const open = useLinear((s) => s.createTicketOpen);
  const creating = useLinear((s) => s.creating);
  const error = useLinear((s) => s.createError);
  const allTeams = useLinear((s) => s.teams);
  const surfacedTeamIds = useSettings((s) => s.surfacedTeamIds);
  const teams = surfacedTeams(allTeams, surfacedTeamIds);
  const users = useLinear((s) => s.users);
  const viewer = useLinear((s) => s.viewer);
  const projects = useLinear((s) => s.projects);
  const allLabels = useLinear((s) => s.labels);

  const currentProjectId = useCurrentProjectId();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState('');
  const [stateId, setStateId] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [priority, setPriority] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [labels, setLabels] = useState<LinearLabel[]>([]);
  const [createWorktreeAfter, setCreateWorktreeAfter] = useState(false);
  const editorRef = useRef<ComposerEditorHandle>(null);

  const states = useLinear((s) => (teamId ? s.workflowStatesByTeam[teamId] ?? [] : []));
  const selectedTeam = teams.find((t) => t.id === teamId) ?? null;
  const selectedState = states.find((st) => st.id === stateId) ?? null;
  const selectedAssignee = users.find((u) => u.id === assigneeId) ?? null;
  const selectedProject = projects.find((p) => p.id === projectId) ?? null;

  // Reset the form each time the modal opens; default the team to the first one
  // and pull the pickers' source data.
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setStateId('');
    setAssigneeId(null);
    setPriority(null);
    setProjectId(null);
    setLabels([]);
    setCreateWorktreeAfter(false);
    editorRef.current?.clear();
    void refreshTeams();
    void refreshUsers();
    void ensureViewer();
    // Default to the configured team when it's still surfaced, else the first
    // surfaced team.
    const { surfacedTeamIds: surfaced, defaultTeamId } = useSettings.getState();
    const currentTeams = surfacedTeams(useLinear.getState().teams, surfaced);
    const preferred =
      defaultTeamId && currentTeams.some((t) => t.id === defaultTeamId)
        ? defaultTeamId
        : (currentTeams[0]?.id ?? '');
    setTeamId(preferred);
  }, [open]);

  // Load the (team-scoped) status / project / label options when the team changes.
  useEffect(() => {
    if (!open || !teamId) return;
    void ensureWorkflowStates(teamId);
    void refreshProjects(teamId);
    void refreshLabels(teamId);
  }, [open, teamId]);

  const pickTeam = (id: string) => {
    setTeamId(id);
    // Status / project / labels are team-scoped — clear them for the new team.
    setStateId('');
    setProjectId(null);
    setLabels([]);
  };

  const addLabel = (label: LinearLabel) =>
    setLabels((prev) => (prev.some((l) => l.id === label.id) ? prev : [...prev, label]));
  const removeLabel = (id: string) => setLabels((prev) => prev.filter((l) => l.id !== id));

  const canSubmit = Boolean(title.trim()) && Boolean(teamId) && !creating;
  const submit = () => {
    if (!canSubmit) return;
    void (async () => {
      const issue = await createTicket({
        teamId,
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId: assigneeId ?? undefined,
        stateId: stateId || undefined,
        priority: priority ?? undefined,
        labelIds: labels.length ? labels.map((l) => l.id) : undefined,
        projectId: projectId ?? undefined,
      });
      if (issue && createWorktreeAfter && currentProjectId) {
        openCreateWorktreeForIssue(currentProjectId, issueToRef(issue));
      }
    })();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setCreateTicketOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="animate-modal-in fixed left-1/2 top-1/2 z-50 flex w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between gap-2 px-4 pb-1.5 pt-3">
            <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
              New ticket{selectedTeam ? ` · ${selectedTeam.key}` : ''}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Title */}
          <div className="px-4 pt-1">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Issue title"
              spellCheck={false}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div className="px-2 pt-1">
            <ComposerEditor
              ref={editorRef}
              disabled={false}
              placeholder="Add a description…"
              allowImages={false}
              editorClassName="min-h-[120px] max-h-64 leading-6"
              onChange={(draft) => setDescription(draft.text)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          {/* Pickers */}
          <div className="flex flex-wrap items-center gap-2 px-4 pb-1 pt-2 text-xs">
            {/* Team */}
            <Combobox
              items={teams}
              getKey={(t) => t.id}
              getFilterText={(t) => `${t.key} ${t.name}`}
              isSelected={(t) => t.id === teamId}
              onSelect={(t) => pickTeam(t.id)}
              placeholder="Search teams…"
              emptyText="No teams"
              triggerClassName={TRIGGER}
              trigger={
                <>
                  <span className="max-w-[10rem] truncate text-neutral-200">
                    {selectedTeam ? `${selectedTeam.key} · ${selectedTeam.name}` : 'Team'}
                  </span>
                  <ChevronDown className="size-3 opacity-70" />
                </>
              }
              renderItem={(t) => (
                <>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{t.key}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-200">{t.name}</span>
                </>
              )}
            />

            {/* Status */}
            <Combobox
              items={states}
              disabled={!teamId}
              getKey={(st) => st.id}
              getFilterText={(st) => st.name}
              isSelected={(st) => st.id === stateId}
              onSelect={(st) => setStateId(st.id)}
              placeholder="Search states…"
              emptyText="No states"
              clear={{ label: 'Default status', active: !stateId, onClear: () => setStateId('') }}
              triggerClassName={cn(TRIGGER, !teamId && 'cursor-not-allowed opacity-50')}
              trigger={
                <>
                  {selectedState && <StateDot color={selectedState.color} />}
                  <span className="max-w-[9rem] truncate text-neutral-200">
                    {selectedState ? selectedState.name : 'Status'}
                  </span>
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

            {/* Assignee (+ Me) */}
            <Combobox
              items={users}
              getKey={(u) => u.id}
              getFilterText={(u) => `${u.displayName} ${u.name}`}
              isSelected={(u) => u.id === assigneeId}
              onSelect={(u) => setAssigneeId(u.id)}
              onOpen={() => void refreshUsers()}
              placeholder="Search users…"
              emptyText="No users"
              clear={{ label: 'Unassigned', active: !assigneeId, onClear: () => setAssigneeId(null) }}
              triggerClassName={TRIGGER}
              trigger={
                <>
                  {selectedAssignee && (
                    <Avatar name={selectedAssignee.name} avatarUrl={selectedAssignee.avatarUrl} className="size-4" />
                  )}
                  <span className="max-w-[9rem] truncate text-neutral-200">
                    {selectedAssignee ? selectedAssignee.displayName : 'Assignee'}
                  </span>
                  <ChevronDown className="size-3 opacity-70" />
                </>
              }
              renderItem={(u) => (
                <>
                  <Avatar name={u.name} avatarUrl={u.avatarUrl} className="size-4" />
                  <span className="min-w-0 flex-1 truncate text-neutral-200">{u.displayName}</span>
                </>
              )}
            />
            {viewer && assigneeId !== viewer.id && (
              <button
                type="button"
                onClick={() => setAssigneeId(viewer.id)}
                title="Assign to me"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-neutral-100"
              >
                <UserPlus className="size-3" />
                Me
              </button>
            )}

            {/* Priority */}
            <Combobox
              items={PRIORITY_OPTIONS}
              getKey={(p) => String(p)}
              getFilterText={(p) => priorityLabel(p)}
              isSelected={(p) => p === priority}
              onSelect={(p) => setPriority(p)}
              placeholder="Search…"
              emptyText="No priorities"
              clear={{ label: 'No priority', active: priority === null, onClear: () => setPriority(null) }}
              triggerClassName={TRIGGER}
              trigger={
                <>
                  {priority !== null && <PriorityIcon priority={priority} />}
                  <span className="max-w-[9rem] truncate text-neutral-200">
                    {priority !== null ? priorityLabel(priority) : 'Priority'}
                  </span>
                  <ChevronDown className="size-3 opacity-70" />
                </>
              }
              renderItem={(p) => (
                <>
                  <PriorityIcon priority={p} />
                  <span className="min-w-0 flex-1 truncate text-neutral-200">{priorityLabel(p)}</span>
                </>
              )}
            />

            {/* Project */}
            <Combobox
              items={projects}
              getKey={(p) => p.id}
              getFilterText={(p) => p.name}
              isSelected={(p) => p.id === projectId}
              onSelect={(p) => setProjectId(p.id)}
              placeholder="Search projects…"
              emptyText="No projects"
              clear={{ label: 'No project', active: !projectId, onClear: () => setProjectId(null) }}
              triggerClassName={TRIGGER}
              trigger={
                <>
                  <span className="max-w-[9rem] truncate text-neutral-200">
                    {selectedProject ? selectedProject.name : 'Project'}
                  </span>
                  <ChevronDown className="size-3 opacity-70" />
                </>
              }
              renderItem={(p) => <span className="min-w-0 flex-1 truncate text-neutral-200">{p.name}</span>}
            />

            {/* Labels (single-select add → chips below) */}
            <Combobox
              items={allLabels}
              getKey={(l) => l.id}
              getFilterText={(l) => l.name}
              isSelected={(l) => labels.some((x) => x.id === l.id)}
              onSelect={addLabel}
              placeholder="Search labels…"
              emptyText="No labels"
              triggerClassName={TRIGGER}
              trigger={
                <>
                  <Tag className="size-3.5 opacity-70" />
                  <span className="text-neutral-200">Labels</span>
                  <ChevronDown className="size-3 opacity-70" />
                </>
              }
              renderItem={(l) => (
                <>
                  <StateDot color={l.color} />
                  <span className="min-w-0 flex-1 truncate text-neutral-200">{l.name}</span>
                </>
              )}
            />
          </div>

          {/* Selected label chips */}
          {labels.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pb-1 pt-1">
              {labels.map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-neutral-200"
                >
                  <StateDot color={l.color} />
                  {l.name}
                  <button
                    type="button"
                    onClick={() => removeLabel(l.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && <p className="px-4 pb-1 pt-1 text-sm text-warn">{error}</p>}

          {/* Footer */}
          <div className="flex items-center gap-2 px-4 pb-3 pt-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={createWorktreeAfter}
                disabled={!currentProjectId}
                onChange={(e) => setCreateWorktreeAfter(e.target.checked)}
                className="accent-primary"
              />
              Create a worktree from this ticket
            </label>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" onClick={() => setCreateTicketOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!canSubmit}>
                {creating ? 'Creating…' : 'Create ticket'}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
