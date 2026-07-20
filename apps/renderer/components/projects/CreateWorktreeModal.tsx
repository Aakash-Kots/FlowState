'use client';

import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowLeft, ChevronDown, GitBranch, ImagePlus, Tag, X } from 'lucide-react';
import { PermissionMode } from '@flowstate/shared';
import type { ChatImageInput, LinearIssueRef } from '@flowstate/shared';
import { fileToChatImage } from '@/lib/chat';
import { MAX_COMPOSER_IMAGE_BYTES } from '@/lib/constants/chat';
import { refreshAssignedIssues, useLinear } from '@/lib/linear';
import { useOnboarding } from '@/lib/onboarding';
import { createWorktree, setCreateOpen, useProjects } from '@/lib/projects';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Combobox } from '@/components/ui/combobox';
import { ComposerEditor, type ComposerEditorHandle } from '@/components/chat/ComposerEditor';
import { LinearTicketChip } from '@/components/linear/LinearTicketChip';
import { LinearTicketDetail } from '@/components/linear/LinearTicketDetail';

/////////////////
// Modal shell //
/////////////////

/**
 * The "New worktree" modal: create a git worktree (a sub-tab) under a project by
 * writing a first prompt, picking a base branch, and optionally starting in Plan
 * mode. Laid out like the workspace composer — the prompt fills the card and the
 * actions sit in a footer bar. The worktree starts "Untitled" and auto-names
 * itself from its first chat.
 */
export function CreateWorktreeModal() {
  const open = useProjects((s) => s.createOpen);
  const projectId = useProjects((s) => s.createProjectId);
  const creating = useProjects((s) => s.creating);
  const error = useProjects((s) => s.createError);
  const branches = useProjects((s) => s.branches);
  const branchesLoading = useProjects((s) => s.branchesLoading);
  const project = useProjects((s) => s.projects.find((p) => p.id === s.createProjectId) ?? null);
  const linearSeed = useProjects((s) => s.createLinearSeed);
  const linearConnected = useOnboarding((s) => s.linearConnected);
  const issues = useLinear((s) => s.assignedIssues);
  const issuesLoading = useLinear((s) => s.assignedLoading);

  const [baseRef, setBaseRef] = useState('');
  const [prompt, setPrompt] = useState('');
  const [promptImages, setPromptImages] = useState<ChatImageInput[]>([]);
  const [planMode, setPlanMode] = useState(false);
  const [linearIssue, setLinearIssue] = useState<LinearIssueRef | null>(null);
  const [branch, setBranch] = useState('');
  // When true the modal shows the linked ticket's details (a "back" button
  // returns to the creation form, which stays mounted so the draft is preserved).
  const [viewingTicket, setViewingTicket] = useState(false);
  const editorRef = useRef<ComposerEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset the form each time the modal opens, defaulting to the project's branch,
  // honoring a pre-linked Linear issue (from the Linear tab), and pulling the
  // latest assigned issues if the account is linked.
  useEffect(() => {
    if (!open) return;
    setBaseRef(project?.worktreeBaseBranch ?? project?.defaultBranch ?? '');
    setPrompt('');
    setPromptImages([]);
    setPlanMode(false);
    setLinearIssue(linearSeed);
    setBranch(linearSeed?.branchName ?? '');
    setViewingTicket(false);
    editorRef.current?.clear();
    editorRef.current?.focus();
    if (linearConnected) void refreshAssignedIssues();
  }, [
    open,
    projectId,
    project?.worktreeBaseBranch,
    project?.defaultBranch,
    linearConnected,
    linearSeed,
  ]);

  // Tickets are created constantly, so re-fetch when the window regains focus
  // while the modal is open (e.g. after creating a ticket in Linear).
  useEffect(() => {
    if (!open || !linearConnected) return;
    const onFocus = () => void refreshAssignedIssues();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [open, linearConnected]);

  // Picking an issue seeds the (editable) branch with Linear's suggested name.
  const selectIssue = (issue: LinearIssueRef | null) => {
    setLinearIssue(issue);
    setBranch(issue?.branchName ?? '');
  };

  const canSubmit = !creating;
  const submit = () => {
    if (!canSubmit) return;
    void createWorktree({
      baseRef,
      initialPrompt: prompt,
      initialImages: promptImages,
      permissionMode: planMode ? PermissionMode.Plan : PermissionMode.Default,
      linearIssue,
      branch: linearIssue ? branch : undefined,
    });
  };

  // The attach button routes through a hidden file input; convert the picks and
  // insert them into the editor (its onChange keeps `promptImages` in sync).
  const onPickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.size <= MAX_COMPOSER_IMAGE_BYTES);
    void Promise.all(files.map(fileToChatImage)).then((imgs) => {
      const valid = imgs.filter((img): img is ChatImageInput => img !== null);
      if (valid.length) editorRef.current?.insertImages(valid);
    });
    e.target.value = ''; // let the same file be picked again after removal
  };

  // The base branch may not be in the fetched list yet (or ever); include it so
  // the picker always reflects the current value.
  const options = branches.includes(baseRef) || !baseRef ? branches : [baseRef, ...branches];

  const triggerClass = 'px-2 py-1 text-muted-foreground hover:bg-muted hover:text-neutral-100';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setCreateOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onKeyDown={(e) => {
            // Shift+Tab toggles Plan mode, matching the composer's mode cycle.
            if (e.key === 'Tab' && e.shiftKey) {
              e.preventDefault();
              setPlanMode((p) => !p);
            }
          }}
          className={cn(
            'animate-modal-in fixed left-1/2 top-1/2 z-50 flex w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl shadow-black/40',
            planMode ? 'border-primary/60' : 'border-border',
          )}
        >
          {/* Creation form — kept mounted (hidden) while viewing the ticket so the
              draft prompt and branch aren't lost. */}
          <div className={viewingTicket ? 'hidden' : 'flex flex-col'}>
            <div className="flex items-center justify-between gap-2 px-4 pb-1.5 pt-3">
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                New worktree{project ? ` · ${project.name}` : ''}
              </DialogPrimitive.Title>
              <div className="flex items-center gap-2">
                {linearConnected ? (
                  <Combobox
                    align="end"
                    placement="bottom"
                    onOpen={() => void refreshAssignedIssues()}
                    triggerClassName="gap-1.5 rounded-full border border-border px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-neutral-100"
                    trigger={
                      <>
                        <Tag className="h-3.5 w-3.5 opacity-70" />
                        <span className="max-w-[12rem] truncate">
                          {linearIssue ? linearIssue.identifier : 'Link Linear issue'}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-70" />
                      </>
                    }
                    items={issues}
                    getKey={(i) => i.id}
                    getFilterText={(i) => `${i.identifier} ${i.title}`}
                    isSelected={(i) => i.id === linearIssue?.id}
                    onSelect={selectIssue}
                    placeholder="Search issues…"
                    emptyText="No assigned issues"
                    loading={issuesLoading}
                    clear={{
                      label: 'No issue',
                      active: !linearIssue,
                      onClear: () => selectIssue(null),
                    }}
                    renderItem={(issue) => (
                      <>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {issue.identifier}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-neutral-200">
                          {issue.title}
                        </span>
                      </>
                    )}
                  />
                ) : null}
                <DialogPrimitive.Close className="text-muted-foreground transition-colors hover:text-foreground">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              </div>
            </div>

            <div className="px-2">
              <ComposerEditor
                ref={editorRef}
                disabled={false}
                placeholder="What should Claude start on in this worktree?  (@ to add a file)"
                allowImages={true}
                editorClassName="min-h-[160px] max-h-80 leading-6"
                mentions={
                  projectId
                    ? { fetch: () => trpc().files.listForProject.query({ projectId }) }
                    : undefined
                }
                onChange={(draft) => {
                  setPrompt(draft.text);
                  setPromptImages(draft.images);
                }}
                onKeyDown={(e) => {
                  // Cmd/Ctrl+Enter submits; Shift+Tab (plan toggle) bubbles to the
                  // dialog's own handler. The `@` menu handles its keys internally.
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            </div>

            {linearIssue ? (
              <div className="flex flex-col gap-1.5 px-4 pb-1 pt-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Linked to</span>
                  <LinearTicketChip issue={linearIssue} onClick={() => setViewingTicket(true)} />
                  <button
                    type="button"
                    onClick={() => setViewingTicket(true)}
                    className="min-w-0 flex-1 truncate text-left text-neutral-300 hover:text-neutral-100"
                  >
                    {linearIssue.title}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    spellCheck={false}
                    placeholder="branch name"
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                  />
                </div>
              </div>
            ) : null}

            {error && <p className="px-4 pb-1 text-sm text-warn">{error}</p>}

            <div className="flex items-center gap-1 px-2 pb-2 pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={onPickImages}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach an image"
                className={cn('inline-flex items-center rounded-md transition-colors', triggerClass)}
              >
                <ImagePlus className="h-4 w-4" />
              </button>

              <Combobox
                triggerClassName={triggerClass}
                trigger={
                  <>
                    <GitBranch className="h-3.5 w-3.5 opacity-70" />
                    <span className="max-w-[12rem] truncate">{baseRef || 'branch'}</span>
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </>
                }
                items={options}
                getKey={(b) => b}
                getFilterText={(b) => b}
                isSelected={(b) => b === baseRef}
                onSelect={setBaseRef}
                placeholder="Search branches…"
                emptyText="No branches"
                loading={branchesLoading}
                renderItem={(b) => <span className="truncate">{b}</span>}
              />

              <button
                type="button"
                onClick={() => setPlanMode((p) => !p)}
                title="Plan mode — Shift+Tab to toggle"
                className={cn(
                  'ml-0.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  planMode
                    ? 'border-primary/60 bg-primary/10 text-primary hover:bg-primary/20'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-neutral-100',
                )}
              >
                <span className="text-[10px] leading-none">◆</span>
                Plan
              </button>

              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={!canSubmit}>
                  {creating ? 'Creating…' : 'Create worktree'}
                </Button>
              </div>
            </div>
          </div>

          {viewingTicket && linearIssue ? (
            <div className="flex max-h-[80vh] flex-col">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <button
                  type="button"
                  onClick={() => setViewingTicket(false)}
                  title="Back to worktree setup"
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">Back</span>
                </button>
                <span className="text-sm font-semibold text-foreground">Ticket details</span>
                <DialogPrimitive.Close className="ml-auto text-muted-foreground transition-colors hover:text-foreground">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <LinearTicketDetail issue={linearIssue} />
              </div>
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
