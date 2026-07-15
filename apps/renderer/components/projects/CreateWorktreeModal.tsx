'use client';

import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronDown, GitBranch, Loader2, Tag, X } from 'lucide-react';
import { PermissionMode } from '@flowstate/shared';
import type { LinearIssueRef } from '@flowstate/shared';
import { refreshIssues, useLinear } from '@/lib/linear';
import { useOnboarding } from '@/lib/onboarding';
import { createWorktree, setCreateOpen, useProjects } from '@/lib/projects';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { DropdownItem, DropdownMenu } from '@/components/ui/dropdown-menu';

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
  const project = useProjects((s) => s.projects.find((p) => p.id === s.createProjectId) ?? null);
  const linearConnected = useOnboarding((s) => s.linearConnected);
  const issues = useLinear((s) => s.issues);
  const issuesLoading = useLinear((s) => s.loading);

  const [baseRef, setBaseRef] = useState('');
  const [prompt, setPrompt] = useState('');
  const [planMode, setPlanMode] = useState(false);
  const [linearIssue, setLinearIssue] = useState<LinearIssueRef | null>(null);
  const [branch, setBranch] = useState('');
  const [issueQuery, setIssueQuery] = useState('');

  // Reset the form each time the modal opens, defaulting to the project's branch,
  // and pull the latest assigned Linear issues if the account is linked.
  useEffect(() => {
    if (!open) return;
    setBaseRef(project?.defaultBranch ?? '');
    setPrompt('');
    setPlanMode(false);
    setLinearIssue(null);
    setBranch('');
    setIssueQuery('');
    if (linearConnected) void refreshIssues();
  }, [open, projectId, project?.defaultBranch, linearConnected]);

  // Tickets are created constantly, so re-fetch when the window regains focus
  // while the modal is open (e.g. after creating a ticket in Linear).
  useEffect(() => {
    if (!open || !linearConnected) return;
    const onFocus = () => void refreshIssues();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [open, linearConnected]);

  // Picking an issue seeds the (editable) branch with Linear's suggested name.
  const selectIssue = (issue: LinearIssueRef | null) => {
    setLinearIssue(issue);
    setBranch(issue?.branchName ?? '');
    setIssueQuery('');
  };

  // Filter the assigned issues by identifier + title as the user types.
  const q = issueQuery.trim().toLowerCase();
  const filteredIssues = q
    ? issues.filter((i) => `${i.identifier} ${i.title}`.toLowerCase().includes(q))
    : issues;

  const canSubmit = !creating;
  const submit = () => {
    if (!canSubmit) return;
    void createWorktree({
      baseRef,
      initialPrompt: prompt,
      permissionMode: planMode ? PermissionMode.Plan : PermissionMode.Default,
      linearIssue,
      branch: linearIssue ? branch : undefined,
    });
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
          <div className="flex items-center justify-between gap-2 px-4 pb-1.5 pt-3">
            <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
              New worktree{project ? ` · ${project.name}` : ''}
            </DialogPrimitive.Title>
            <div className="flex items-center gap-2">
              {linearConnected ? (
                <DropdownMenu
                  align="end"
                  placement="bottom"
                  panelClassName="bg-background"
                  onOpenChange={(o) => {
                    // Re-fetch each time the picker opens — new tickets may exist.
                    if (o) void refreshIssues();
                  }}
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
                >
                  {(close) => (
                    <div className="flex w-72 flex-col">
                      <div className="relative mb-1">
                        <input
                          autoFocus
                          value={issueQuery}
                          onChange={(e) => setIssueQuery(e.target.value)}
                          placeholder="Search issues…"
                          spellCheck={false}
                          className="h-7 w-full rounded-md border border-border bg-background pl-2 pr-7 text-xs text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                        />
                        {issuesLoading ? (
                          <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => {
                            selectIssue(null);
                            close();
                          }}
                          className={cn(
                            'flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                            linearIssue ? 'text-muted-foreground' : 'text-neutral-100',
                          )}
                        >
                          No issue
                        </button>
                        {filteredIssues.length === 0 ? (
                          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                            {issuesLoading && issues.length === 0 ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Loading issues…
                              </>
                            ) : (
                              <span>{issues.length === 0 ? 'No assigned issues' : 'No matches'}</span>
                            )}
                          </div>
                        ) : (
                          filteredIssues.map((issue) => (
                            <button
                              key={issue.id}
                              type="button"
                              onClick={() => {
                                selectIssue(issue);
                                close();
                              }}
                              className={cn(
                                'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                                issue.id === linearIssue?.id ? 'bg-accent/50' : '',
                              )}
                            >
                              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                                {issue.identifier}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-neutral-200">
                                {issue.title}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </DropdownMenu>
              ) : null}
              <DialogPrimitive.Close className="text-muted-foreground transition-colors hover:text-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          </div>

          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder="What should Claude start on in this worktree?"
            className="max-h-80 min-h-[180px] w-full resize-none bg-transparent px-4 py-1 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none"
          />

          {linearIssue ? (
            <div className="flex items-center gap-2 px-4 pb-1 pt-1">
              <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                spellCheck={false}
                placeholder="branch name"
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
          ) : null}

          {error && <p className="px-4 pb-1 text-sm text-warn">{error}</p>}

          <div className="flex items-center gap-1 px-2 pb-2 pt-1">
            <DropdownMenu
              triggerClassName={triggerClass}
              trigger={
                <>
                  <GitBranch className="h-3.5 w-3.5 opacity-70" />
                  <span className="max-w-[12rem] truncate">{baseRef || 'branch'}</span>
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </>
              }
            >
              {(close) =>
                options.length === 0 ? (
                  <div className="px-2.5 py-2 text-xs text-muted-foreground">No branches</div>
                ) : (
                  options.map((b) => (
                    <DropdownItem
                      key={b}
                      selected={b === baseRef}
                      onSelect={() => {
                        setBaseRef(b);
                        close();
                      }}
                    >
                      {b}
                    </DropdownItem>
                  ))
                )
              }
            </DropdownMenu>

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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
