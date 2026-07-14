'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ClaudeSessionState,
  PermissionBehavior,
  PermissionMode,
  type SkillOption,
} from '@flowstate/shared';
import {
  clearChat,
  cyclePermissionMode,
  interruptSession,
  loadSupportedSkills,
  respondPermission,
  sendPrompt,
  useChat,
  useFocusInput,
  usePrefillComposer,
  useTabId,
} from '@/lib/chat';
import { EXIT_PLAN_MODE_TOOL } from '@/lib/constants/tools';
import { cn } from '../ui/cn';
import { Button } from '../ui/Button';
import { InlinePrompt } from './InlinePrompt';
import { InputToolbar } from './InputToolbar';
import { SlashMenu } from './SlashMenu';

const MAX_ROWS = 8;
const LINE_HEIGHT_PX = 20;

/**
 * The floating prompt bar: a rounded card overlaid on the bottom of the
 * conversation (which scrolls beneath it behind a gradient fade). Holds an
 * auto-growing textarea + model/effort toolbar, and swaps to an inline
 * permission/question prompt when Claude is waiting on the user.
 */
export function InputBar({ disabled }: { disabled: boolean }) {
  const tabId = useTabId();
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
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const busy =
    sessionState === ClaudeSessionState.Running || sessionState === ClaudeSessionState.Waiting;

  useEffect(() => {
    if (!disabled && !hasPrompt) textareaRef.current?.focus();
  }, [disabled, hasPrompt]);

  // Let the FocusInput shortcut focus the composer from anywhere.
  useFocusInput(() => textareaRef.current?.focus());

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * LINE_HEIGHT_PX + 20)}px`;
  };

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
  const filteredSkills =
    slashQuery !== null
      ? skills.filter(
          (sk) =>
            sk.name.toLowerCase().includes(slashQuery) ||
            sk.aliases?.some((a) => a.toLowerCase().includes(slashQuery)),
        )
      : [];
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

  // Drop `text` into the composer, focus it, and put the cursor at the end —
  // shared by a `/` menu selection and the Skills & Actions panel's prefill.
  const setComposer = (next: string) => {
    setText(next);
    setMenuDismissed(true);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(next.length, next.length);
      }
      resize();
    });
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

  const submit = () => {
    if (disabled || !text.trim()) return;
    // `/clear` is an in-app command, not a prompt: wipe the chat and start fresh
    // rather than sending the literal text to the SDK.
    if (text.trim() === '/clear') {
      clearChat(tabId);
      setText('');
      requestAnimationFrame(resize);
      return;
    }
    // While a plan awaits a decision, a typed message means "keep planning":
    // deny the plan and hand Claude the note so it revises without leaving plan
    // mode (the reply-to-keep-planning path from the old inline prompt).
    if (pendingPlan) {
      respondPermission(tabId, pendingPlan.id, PermissionBehavior.Deny, text.trim());
      setText('');
      requestAnimationFrame(resize);
      return;
    }
    sendPrompt(tabId, text);
    setText('');
    requestAnimationFrame(resize);
  };

  return (
    <div
      ref={wrapperRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-4 pt-10"
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
                    className="border border-auto-accept/60 bg-auto-accept/15 px-2.5 py-1 text-xs text-auto-accept hover:bg-auto-accept/25"
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
                  <Button
                    variant="secondary"
                    className="px-2.5 py-1 text-xs"
                    onClick={() =>
                      respondPermission(tabId, pendingPlan.id, PermissionBehavior.Deny)
                    }
                  >
                    Continue planning
                  </Button>
                </div>
              )}
              <div className="px-2.5 py-2">
                <textarea
                  ref={textareaRef}
                  value={text}
                  rows={3}
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
                  onChange={(e) => {
                    setText(e.target.value);
                    setMenuDismissed(false);
                    resize();
                  }}
                  onKeyDown={(e) => {
                    // The `/` menu owns Escape whenever it's open, and
                    // Arrow/Enter/Tab once it actually has skills to pick from.
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
                          setMenuIndex(
                            (i) => (i - 1 + filteredSkills.length) % filteredSkills.length,
                          );
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
                      e.preventDefault();
                      submit();
                    } else if (e.key === 'Tab' && e.shiftKey) {
                      // Cycle permission mode without letting Tab move focus away.
                      e.preventDefault();
                      cyclePermissionMode(tabId);
                    } else if (e.key === 'Escape' && busy) {
                      e.preventDefault();
                      interruptSession(tabId);
                    }
                  }}
                  className="max-h-48 min-h-[76px] w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-5 text-neutral-100 placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <InputToolbar
                disabled={disabled}
                trailing={
                  busy && !pendingPlan ? (
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs text-danger"
                      onClick={() => interruptSession(tabId)}
                    >
                      Stop
                    </Button>
                  ) : (
                    <Button
                      className="px-2.5 py-1 text-xs"
                      onClick={submit}
                      disabled={disabled || !text.trim()}
                    >
                      Send
                    </Button>
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
