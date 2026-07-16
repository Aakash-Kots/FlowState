'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eraser, FolderTree, Play, Plus, Sparkles, X } from 'lucide-react';
import {
  BUILTIN_ACTIONS,
  BuiltinActionKind,
  PinnedItemKind,
  TabKind,
  type BuiltinAction,
  type PinnedItem,
  type SkillOption,
} from '@flowstate/shared';
import { clearChat, loadSupportedSkills, prefillComposer, useChat, useTabId } from '@/lib/chat';
import { importSkill, pinItem, unpinItem, usePins, usePinsSync } from '@/lib/pins';
import { useProjects } from '@/lib/projects';
import {
  persistSkillsPanelWidth,
  persistTerminalPanelFraction,
  setSkillsPanelOpen,
  setSkillsPanelWidth,
  setTerminalPanelFraction,
  useSettings,
} from '@/lib/settings';
import { useWorkspace } from '@/lib/workspace';
import { FileBrowser } from '../files/FileBrowser';
import { TerminalTabs } from '../terminal/TerminalTabs';
import { cn } from '../ui/cn';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { SkillPicker } from './SkillPicker';

///////////
// Types //
///////////

/** Which tab of the right panel's top half is showing. */
type PanelTab = 'skills' | 'files';

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

/**
 * The chat view's right-hand Skills & Actions panel: pin Claude skills to this
 * worktree or its repo and click them to drop `/skill ` into the composer, plus
 * built-in actions. Resizable via its left edge and collapsible to a slim rail;
 * both are persisted. Must render inside a `TabProvider` (reads the tab's skills).
 */
export function SkillsPanel() {
  const open = useSettings((s) => s.skillsPanelOpen);
  const width = useSettings((s) => s.skillsPanelWidth);
  const terminalFraction = useSettings((s) => s.terminalPanelFraction);
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
  const [panelTab, setPanelTab] = useState<PanelTab>('skills');
  const tabId = useTabId();
  // The panel is mounted for file tabs too (so the tree persists while browsing),
  // but skills/actions act on a chat session — gate that content on a chat tab.
  const isChatTab = useWorkspace(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.kind === TabKind.Chat,
  );

  usePinsSync(workspaceId, projectId);

  // Live description lookup for a pinned skill (falls back to the stored label).
  const skillByName = useMemo(
    () => new Map<string, SkillOption>(skills.map((s) => [s.name, s])),
    [skills],
  );
  const describe = (pin: PinnedItem) => skillByName.get(pin.ref)?.description;

  // Measures the stacked-halves column so the vertical drag can map pixels to a
  // height fraction.
  const splitRef = useRef<HTMLDivElement>(null);

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

  // Drag the divider between the two halves: pulling it down shrinks the terminal.
  const startVResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const total = splitRef.current?.clientHeight ?? 0;
    if (total <= 0) return;
    const startY = e.clientY;
    const startFraction = useSettings.getState().terminalPanelFraction;
    const onMove = (ev: MouseEvent) =>
      setTerminalPanelFraction(startFraction - (ev.clientY - startY) / total);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      persistTerminalPanelFraction();
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
      <div ref={splitRef} className="flex min-h-0 min-w-0 flex-1 flex-col bg-secondary">
        {/* Top section: Skills & Actions / Files. */}
        <Tabs
          value={panelTab}
          onValueChange={(v) => setPanelTab(v as PanelTab)}
          className="flex min-h-0 flex-col"
          style={{ flex: `${1 - terminalFraction} 1 0%` }}
        >
          <div className="flex items-center justify-between gap-1 border-b border-border px-2 py-1.5">
            <TabsList className="h-7 gap-0.5 bg-transparent p-0">
              <TabsTrigger
                value="skills"
                className="h-7 gap-1 px-2 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
              >
                <Sparkles className="size-3.5 shrink-0" />
                <span className="truncate">Skills &amp; Actions</span>
              </TabsTrigger>
              <TabsTrigger
                value="files"
                className="h-7 gap-1 px-2 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
              >
                <FolderTree className="size-3.5 shrink-0" />
                Files
              </TabsTrigger>
            </TabsList>
            <div className="flex shrink-0 items-center gap-0.5">
              {panelTab === 'skills' && isChatTab && (
                <button
                  type="button"
                  onClick={() => {
                    // Ensure the session's skills are loaded — otherwise the
                    // picker's "Skills" group is empty until the composer's
                    // `/` menu has been opened at least once.
                    loadSupportedSkills(tabId);
                    setPickerOpen(true);
                  }}
                  title="Pin a skill"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Plus className="size-4" />
                </button>
              )}
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

          <TabsContent
            value="skills"
            className="mt-0 hidden min-h-0 flex-1 flex-col data-[state=active]:flex"
          >
            {isChatTab ? (
              <>
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
                      Pin a skill with <span className="text-neutral-300">+</span> to run it here in
                      one click.
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
              </>
            ) : (
              <p className="px-3 pt-3 text-[11px] leading-relaxed text-muted-foreground">
                Open a chat tab to use skills &amp; actions.
              </p>
            )}
          </TabsContent>

          <TabsContent
            value="files"
            className="mt-0 hidden min-h-0 flex-1 flex-col data-[state=active]:flex"
          >
            <FileBrowser />
          </TabsContent>
        </Tabs>

        {/* Draggable divider between the two sections (drag up/down to resize). */}
        <div
          onMouseDown={startVResize}
          className="group relative h-px shrink-0 cursor-row-resize bg-border transition-colors hover:bg-primary/40"
        >
          <div className="absolute inset-x-0 -top-1 h-2" />
        </div>

        {/* Bottom section: a live terminal, always present for this worktree. */}
        <div
          className="flex min-h-0 flex-col"
          style={{ flex: `${terminalFraction} 1 0%` }}
        >
          <TerminalTabs />
        </div>
      </div>

      <SkillPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        skills={skills}
        canPinRepo={projectId !== null}
        workspaceId={workspaceId}
        onPin={(skill, scope) =>
          void pinItem({
            workspaceId: scope === 'worktree' ? workspaceId : null,
            projectId: scope === 'repo' ? projectId : null,
            kind: PinnedItemKind.Skill,
            ref: skill.name,
            label: skill.name,
          })
        }
        onImport={(sourcePath) => void importSkill({ workspaceId, tabId, sourcePath })}
      />

      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Clear chat?"
        description="This permanently deletes this chat's messages and starts a fresh Claude session. It can't be undone."
        confirmLabel="Clear chat"
        destructive
        onConfirm={() => {
          clearChat(tabId);
          setConfirmClearOpen(false);
        }}
      />
    </div>
  );
}
