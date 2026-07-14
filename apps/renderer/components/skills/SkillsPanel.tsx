'use client';

import { useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Eraser, Play, Plus, X } from 'lucide-react';
import {
  BUILTIN_ACTIONS,
  BuiltinActionKind,
  PinnedItemKind,
  type BuiltinAction,
  type PinnedItem,
  type SkillOption,
} from '@flowstate/shared';
import { clearChat, prefillComposer, useChat, useTabId } from '@/lib/chat';
import { Button } from '../ui/Button';
import { pinItem, unpinItem, usePins, usePinsSync } from '@/lib/pins';
import { useProjects } from '@/lib/projects';
import {
  persistSkillsPanelWidth,
  setSkillsPanelOpen,
  setSkillsPanelWidth,
  useSettings,
} from '@/lib/settings';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '../ui/cn';
import { UsageIndicator } from '../usage/UsageIndicator';
import { SkillPicker } from './SkillPicker';

///////////////////
// Sub-components //
///////////////////

/** A section label above a group of pins/actions. */
function SectionHeading({ children }: { children: string }) {
  return (
    <div className="px-3 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

/** One clickable pinned skill: prefills the composer, unpin on hover. */
function PinRow({ pin, description }: { pin: PinnedItem; description?: string }) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => prefillComposer(`/${pin.ref} `)}
        title={description ?? pin.label}
        className="flex w-full flex-col gap-0.5 rounded-md px-3 py-1.5 pr-8 text-left transition-colors hover:bg-muted"
      >
        <span className="truncate text-xs font-medium text-neutral-100">/{pin.ref}</span>
        {description && (
          <span className="truncate text-[11px] leading-snug text-muted-foreground">
            {description}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => void unpinItem(pin.id)}
        title="Unpin"
        className="absolute right-1.5 top-1.5 hidden rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground group-hover:block"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * One built-in action row. A `Prefill` action drops its canned prompt into the
 * composer; a `ClearChat` action runs directly (its click asks the panel to open
 * the confirmation modal via `onClearChat`).
 */
function ActionRow({ action, onClearChat }: { action: BuiltinAction; onClearChat: () => void }) {
  const isClear = action.kind === BuiltinActionKind.ClearChat;
  const Icon = isClear ? Eraser : Play;
  return (
    <button
      type="button"
      onClick={isClear ? onClearChat : () => prefillComposer(action.insertText)}
      title={isClear ? 'Clear this chat and start fresh' : action.insertText}
      className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs text-neutral-100 transition-colors hover:bg-muted"
    >
      <Icon className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate font-medium">{action.label}</span>
    </button>
  );
}

/** Confirmation modal for the destructive "Clear chat" action. */
function ConfirmClearDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-background p-5 shadow-2xl shadow-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="flex flex-col gap-1.5">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              Clear chat?
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              This permanently deletes this chat&apos;s messages and starts a fresh Claude
              session. It can&apos;t be undone.
            </DialogPrimitive.Description>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="text-danger" variant="secondary" onClick={onConfirm}>
              Clear chat
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The chat view's right-hand Skills & Actions panel: pin Claude skills to this
 * worktree or its repo and click them to drop `/skill ` into the composer, plus
 * built-in actions. Resizable via its left edge and collapsible to a slim rail;
 * both are persisted. Must render inside a `TabProvider` (reads the tab's skills).
 */
export function SkillsPanel() {
  const open = useSettings((s) => s.skillsPanelOpen);
  const width = useSettings((s) => s.skillsPanelWidth);
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const projectId = useProjects(
    (s) =>
      Object.values(s.worktrees)
        .flat()
        .find((w) => w.id === workspaceId)?.projectId ?? null,
  );
  const skills = useChat((s) => s.skills);
  const worktreePins = usePins((s) => s.worktree);
  const repoPins = usePins((s) => s.repo);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const tabId = useTabId();

  usePinsSync(workspaceId, projectId);

  // Live description lookup for a pinned skill (falls back to the stored label).
  const skillByName = useMemo(
    () => new Map<string, SkillOption>(skills.map((s) => [s.name, s])),
    [skills],
  );
  const describe = (pin: PinnedItem) => skillByName.get(pin.ref)?.description;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = useSettings.getState().skillsPanelWidth;
    const onMove = (ev: MouseEvent) => setSkillsPanelWidth(startWidth + (startX - ev.clientX));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      persistSkillsPanelWidth();
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (!open) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center border-l border-border bg-secondary py-2">
        <button
          type="button"
          onClick={() => setSkillsPanelOpen(true)}
          title="Show skills & actions"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>
    );
  }

  const hasPins = worktreePins.length > 0 || repoPins.length > 0;

  return (
    <div className="flex shrink-0" style={{ width }}>
      <div
        onMouseDown={startResize}
        className="group relative w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40"
      >
        <div className="absolute inset-y-0 -left-1 w-2" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-secondary">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold text-neutral-100">Skills &amp; Actions</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              title="Pin a skill"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setSkillsPanelOpen(false)}
              title="Hide panel"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          {worktreePins.length > 0 && (
            <>
              <SectionHeading>This worktree</SectionHeading>
              {worktreePins.map((pin) => (
                <PinRow key={pin.id} pin={pin} description={describe(pin)} />
              ))}
            </>
          )}

          {repoPins.length > 0 && (
            <>
              <SectionHeading>This repo</SectionHeading>
              {repoPins.map((pin) => (
                <PinRow key={pin.id} pin={pin} description={describe(pin)} />
              ))}
            </>
          )}

          {!hasPins && (
            <p className="px-3 pt-3 text-[11px] leading-relaxed text-muted-foreground">
              Pin a skill with <span className="text-neutral-300">+</span> to run it here in one
              click.
            </p>
          )}

          <SectionHeading>Actions</SectionHeading>
          {BUILTIN_ACTIONS.map((action) => (
            <ActionRow
              key={action.id}
              action={action}
              onClearChat={() => setConfirmClearOpen(true)}
            />
          ))}
        </div>

        <UsageIndicator />
      </div>

      <SkillPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        skills={skills}
        canPinRepo={projectId !== null}
        onPin={(skill, scope) =>
          void pinItem({
            workspaceId: scope === 'worktree' ? workspaceId : null,
            projectId: scope === 'repo' ? projectId : null,
            kind: PinnedItemKind.Skill,
            ref: skill.name,
            label: skill.name,
          })
        }
      />

      <ConfirmClearDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        onConfirm={() => {
          clearChat(tabId);
          setConfirmClearOpen(false);
        }}
      />
    </div>
  );
}
