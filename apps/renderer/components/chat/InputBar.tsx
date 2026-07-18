'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  ClaudeSessionState,
  PermissionBehavior,
  PermissionMode,
  type SkillOption,
} from '@flowstate/shared';
import {
  clearChat,
  cyclePermissionMode,
  fileToChatImage,
  interruptSession,
  loadSupportedSkills,
  respondPermission,
  sendPrompt,
  useChat,
  useFocusInput,
  usePrefillComposer,
  useTabId,
} from '@/lib/chat';
import {
  clearComposerDraft,
  getComposerDraft,
  setComposerDraft,
} from '@/lib/composerDrafts';
import { MAX_COMPOSER_IMAGE_BYTES } from '@/lib/constants/chat';
import { EXIT_PLAN_MODE_TOOL } from '@/lib/constants/tools';
import { trpc } from '@/lib/trpc';
import type { ComposerDraft } from '@/lib/types/chat';
import { useWorkspace } from '@/lib/workspace';
import { ArrowUp, Square } from 'lucide-react';
import { cn } from '../ui/cn';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { ComposerEditor, type ComposerEditorHandle } from './ComposerEditor';
import { InlinePrompt } from './InlinePrompt';
import { InputToolbar } from './InputToolbar';
import { SlashMenu } from './SlashMenu';

/**
 * The floating prompt bar: a rounded card overlaid on the bottom of the
 * conversation (which scrolls beneath it behind a gradient fade). Holds a rich
 * text-plus-image-pill composer + model/effort toolbar, and swaps to an inline
 * permission/question prompt when Claude is waiting on the user.
 */
export function InputBar({ disabled }: { disabled: boolean }) {
  const tabId = useTabId();
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const sessionState = useChat((s) => s.sessionState);
  const permissionMode = useChat((s) => s.permissionMode);
  const error = useChat((s) => s.error);
  // A pending ExitPlanMode plan no longer hijacks the composer — the plan renders
  // inline in the stream and the textarea stays live so the user can approve via
  // the action bar or just type to keep planning. Questions and every other
  // tool-permission prompt still take the composer over.
  const pendingPlan = useChat(
    (s) => s.pendingPermissions.find((p) => p.toolName === EXIT_PLAN_MODE_TOOL) ?? null,
  );
  const hasPrompt = useChat(
    (s) =>
      s.pendingQuestions.length > 0 ||
      s.pendingPermissions.some((p) => p.toolName !== EXIT_PLAN_MODE_TOOL),
  );
  // `text` mirrors the editor's plain text (drives the slash menu + send gating);
  // `hasImages` tracks whether the draft carries any attachments. The editor owns
  // the actual content — read the authoritative draft via `editorRef.getDraft()`.
  const [text, setText] = useState('');
  const [hasImages, setHasImages] = useState(false);
  const editorRef = useRef<ComposerEditorHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy =
    sessionState === ClaudeSessionState.Running || sessionState === ClaudeSessionState.Waiting;

  // Each chat tab owns its unsent draft. Restore this tab's saved text + images
  // whenever the active chat changes (the composer instance is reused across tab
  // switches, so it would otherwise carry the previous chat's text) or the editor
  // remounts after an inline prompt clears. The editor is uncontrolled, so push
  // the stored draft in imperatively and re-sync the mirrored plain text.
  useEffect(() => {
    if (hasPrompt) return;
    const draft = getComposerDraft(tabId);
    editorRef.current?.setDraft(draft);
    setText(draft.text);
    setHasImages(draft.images.length > 0);
    setMenuDismissed(true);
  }, [tabId, hasPrompt]);

  useEffect(() => {
    if (!disabled && !hasPrompt) editorRef.current?.focus();
  }, [disabled, hasPrompt]);

  // Publish the composer's live height as `--input-h` on the shared session
  // container so the transcript can reserve exactly that much bottom padding —
  // the content then scrolls to rest just above the box (with a small gap) no
  // matter how tall the bar grows (plan action row, multi-line drafts, errors).
  useEffect(() => {
    const el = wrapperRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const update = () => parent.style.setProperty('--input-h', `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      parent.style.removeProperty('--input-h');
    };
  }, []);

  // Let the FocusInput shortcut focus the composer from anywhere.
  useFocusInput(() => editorRef.current?.focus());

  // The `/` skill menu: open while the composer holds a lone `/<query>` token (no
  // space yet) and the user hasn't dismissed it — showing a loading state while
  // the session boots and its skills stream in.
  const skills = useChat((s) => s.skills);
  const skillsLoaded = useChat((s) => s.skillsLoaded);
  const skillsLoading = useChat((s) => s.skillsLoading);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const slashMatch = /^\/(\S*)$/.exec(text);
  const slashQuery = slashMatch ? slashMatch[1].toLowerCase() : null;
  // Recompute only when the query or skill set changes — not on every re-render
  // (e.g. arrow-key menu navigation, which only moves the highlight).
  const filteredSkills = useMemo(
    () =>
      slashQuery !== null
        ? skills.filter(
            (sk) =>
              sk.name.toLowerCase().includes(slashQuery) ||
              sk.aliases?.some((a) => a.toLowerCase().includes(slashQuery)),
          )
        : [],
    [skills, slashQuery],
  );
  // Keep the menu up during the initial load so it can show a spinner.
  const menuLoading = skillsLoading && filteredSkills.length === 0;
  const menuActive = !disabled && !hasPrompt && !menuDismissed && slashQuery !== null;
  const menuOpen = menuActive && (filteredSkills.length > 0 || menuLoading);
  const activeIndex = Math.min(menuIndex, filteredSkills.length - 1);

  // Pull the session's skills the moment the user reaches for the menu.
  useEffect(() => {
    if (slashQuery !== null && !skillsLoaded) loadSupportedSkills(tabId);
  }, [slashQuery, skillsLoaded, tabId]);

  // Reset the highlight whenever the query changes.
  useEffect(() => {
    setMenuIndex(0);
  }, [slashQuery]);

  // Drop plain `text` into the composer, focus it, and put the cursor at the end
  // — shared by a `/` menu selection and the Skills & Actions panel's prefill.
  const setComposer = (next: string) => {
    editorRef.current?.setText(next);
    setText(next);
    setHasImages(false);
    setMenuDismissed(true);
    setComposerDraft(tabId, { text: next, images: [] });
  };

  const selectSkill = (skill: SkillOption) => setComposer(`/${skill.name} `);

  // Let the Skills & Actions panel prefill this composer (insert-then-send).
  usePrefillComposer(setComposer);

  // The card overlays the conversation, so wheeling over it (especially a tall
  // Edit/Write/Delete approval prompt) is otherwise swallowed instead of
  // scrolling the messages beneath. Let any scrollable region inside the card
  // (diff preview, plan panel, the textarea) consume the wheel first, then
  // redirect the leftover to the conversation scroller.
  const forwardWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    for (
      let node = e.target as HTMLElement | null;
      node && node !== e.currentTarget;
      node = node.parentElement
    ) {
      const overflowY = getComputedStyle(node).overflowY;
      const scrollable =
        node.tagName === 'TEXTAREA' || overflowY === 'auto' || overflowY === 'scroll';
      if (scrollable && node.scrollHeight > node.clientHeight) {
        const atTop = node.scrollTop <= 0;
        const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
        if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) return;
      }
    }
    const scroller =
      wrapperRef.current?.parentElement?.querySelector<HTMLElement>('[data-chat-scroll]');
    if (scroller) scroller.scrollTop += e.deltaY;
  };

  // Keep the mirrored plain text + attachment flag in sync as the user edits, and
  // re-enable the slash menu the moment they type again.
  const onEditorChange = (draft: ComposerDraft) => {
    setText(draft.text);
    setHasImages(draft.images.length > 0);
    setMenuDismissed(false);
    setComposerDraft(tabId, draft);
  };

  // The toolbar's image button routes through a hidden file input; convert the
  // picks and hand them to the editor to insert at the caret.
  const onPickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(
      (f) => f.size <= MAX_COMPOSER_IMAGE_BYTES,
    );
    void Promise.all(files.map(fileToChatImage)).then((imgs) => {
      const valid = imgs.filter((img): img is NonNullable<typeof img> => img !== null);
      if (valid.length) editorRef.current?.insertImages(valid);
    });
    e.target.value = ''; // let the same file be picked again after removal
  };

  const resetComposer = () => {
    editorRef.current?.clear();
    setText('');
    setHasImages(false);
    clearComposerDraft(tabId);
  };

  const submit = () => {
    const draft = editorRef.current?.getDraft() ?? { text: '', images: [] };
    const trimmed = draft.text.trim();
    if (disabled || (!trimmed && draft.images.length === 0)) return;
    // `/clear` is an in-app command, not a prompt: wipe the chat and start fresh
    // rather than sending the literal text to the SDK.
    if (trimmed === '/clear') {
      clearChat(tabId);
      resetComposer();
      return;
    }
    // While a plan awaits a decision, a typed message means "keep planning":
    // deny the plan and hand Claude the note so it revises without leaving plan
    // mode (the reply-to-keep-planning path from the old inline prompt).
    if (pendingPlan) {
      respondPermission(tabId, pendingPlan.id, PermissionBehavior.Deny, trimmed);
      resetComposer();
      return;
    }
    sendPrompt(tabId, draft.text, draft.images);
    resetComposer();
  };

  const onEditorKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // The `/` menu owns Escape whenever it's open, and Arrow/Enter/Tab once it
    // actually has skills to pick from.
    if (menuOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuDismissed(true);
        return;
      }
      if (filteredSkills.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMenuIndex((i) => (i + 1) % filteredSkills.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMenuIndex((i) => (i - 1 + filteredSkills.length) % filteredSkills.length);
          return;
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
          e.preventDefault();
          const skill = filteredSkills[activeIndex];
          if (skill) selectSkill(skill);
          return;
        }
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter sends; Shift+Enter falls through to insert a newline in the editor.
      e.preventDefault();
      submit();
    } else if (e.key === 'Tab' && e.shiftKey) {
      // Cycle permission mode without letting Tab move focus away.
      e.preventDefault();
      cyclePermissionMode(tabId);
    } else if (e.key === 'Escape' && busy) {
      e.preventDefault();
      interruptSession(tabId);
    } else if (e.key === 'c' && e.ctrlKey && busy) {
      // Ctrl+C stops a running turn, matching Claude Code's terminal muscle
      // memory. Safe to claim here: on macOS copy is Cmd+C (metaKey), so this
      // never clobbers copy, and scoping to the composer leaves the terminal
      // panes' own Ctrl+C (SIGINT) untouched.
      e.preventDefault();
      interruptSession(tabId);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent px-4 pb-4 pt-4"
    >
      <div className="pointer-events-auto relative mx-auto max-w-3xl">
        {menuOpen && (
          <SlashMenu
            skills={filteredSkills}
            activeIndex={activeIndex}
            loading={menuLoading}
            onSelect={selectSkill}
            onHover={setMenuIndex}
          />
        )}
        {error && (
          <div className="mb-2 rounded-md border border-danger/40 bg-muted px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
        <div
          onWheel={forwardWheel}
          className={cn(
            'rounded-md border bg-secondary shadow-lg shadow-black/20',
            permissionMode === PermissionMode.Plan
              ? 'border-primary/40'
              : permissionMode === PermissionMode.BypassPermissions
                ? 'border-auto-accept/60'
                : 'border-border',
          )}
        >
          {hasPrompt ? (
            <InlinePrompt />
          ) : (
            <>
              {pendingPlan && (
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-2.5 py-2">
                  <span className="mr-auto flex items-center gap-2 text-xs font-medium text-neutral-200">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
                    Plan ready — approve, or reply to keep planning
                  </span>
                  <Button
                    className="px-2.5 py-1 text-xs"
                    onClick={() =>
                      respondPermission(
                        tabId,
                        pendingPlan.id,
                        PermissionBehavior.Allow,
                        undefined,
                        PermissionMode.BypassPermissions,
                      )
                    }
                    title="Approve and run hands-off — no further permission prompts"
                  >
                    Approve &amp; auto-accept
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-2.5 py-1 text-xs"
                    onClick={() =>
                      respondPermission(
                        tabId,
                        pendingPlan.id,
                        PermissionBehavior.Allow,
                        undefined,
                        PermissionMode.Default,
                      )
                    }
                  >
                    Approve &amp; manually accept
                  </Button>
                </div>
              )}
              <div className="px-2.5 py-2">
                <ComposerEditor
                  ref={editorRef}
                  disabled={disabled}
                  placeholder={
                    disabled
                      ? 'Choose a folder to start…'
                      : pendingPlan
                        ? 'Reply to keep planning — Enter to send, Shift+Enter for a new line'
                        : permissionMode === PermissionMode.Plan
                          ? 'Plan this out — Claude will propose a plan first (Shift+Tab to cycle)'
                          : permissionMode === PermissionMode.BypassPermissions
                            ? 'Auto-accept on — Claude runs hands-off, no prompts (Shift+Tab to cycle)'
                            : 'Message Claude — Enter to send, Shift+Enter for a new line'
                  }
                  onChange={onEditorChange}
                  onKeyDown={onEditorKeyDown}
                  mentions={{ fetch: () => trpc().files.list.query({ workspaceId }) }}
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={onPickImages}
              />
              <InputToolbar
                disabled={disabled}
                onAttachImage={() => fileInputRef.current?.click()}
                trailing={
                  busy && !pendingPlan ? (
                    <IconButton
                      variant="secondary"
                      className="text-danger"
                      onClick={() => interruptSession(tabId)}
                      title="Stop"
                      aria-label="Stop"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </IconButton>
                  ) : (
                    <IconButton
                      onClick={submit}
                      disabled={disabled || (!text.trim() && !hasImages)}
                      title="Send"
                      aria-label="Send"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </IconButton>
                  )
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
