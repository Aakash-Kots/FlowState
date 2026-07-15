'use client';

import { createContext, createElement, useContext, useEffect, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  ChatBlockType,
  ChatEventKind,
  ClaudeSessionState,
  CURATED_MODELS,
  ImageMediaType,
  mergeModelOptions,
  PermissionBehavior,
  PermissionMode,
  ReasoningEffort,
  type BackgroundTask,
  type ChatEvent,
  type ChatImageInput,
  type ChatMessage,
  type ModelOption,
  type PermissionRequest,
  type QuestionRequest,
  type SkillOption,
} from '@flowstate/shared';
import { ActivityIndicator } from './enums/chat';
import { WorkspaceView } from './enums/view';
import { playPing } from './notify';
import { useProjects } from './projects';
import { useSettings } from './settings';
import { trpc } from './trpc';
import { useWorkspace } from './workspace';

///////////
// Types //
///////////

type ChatEntry = {
  message: ChatMessage;
  createdAt: string;
};

/** Live per-task enrichment for a background agent, keyed by task id (all optional). */
type BackgroundTaskDetail = {
  subagentType?: string;
  prompt?: string;
  lastToolName?: string;
  totalTokens?: number;
  toolUses?: number;
  durationMs?: number;
  summary?: string;
};

type ChatState = {
  /** True once the snapshot query has seeded the store. */
  hydrated: boolean;
  sessionState: ClaudeSessionState;
  /** When the current turn started running (`Date.now()`), for the live timer; null when idle. */
  runStartedAt: number | null;
  sessionId: string | null;
  cwd: string | null;
  /** Effective model for the picker (explicit selection, else last-run default). */
  model: string | null;
  /** Selected reasoning effort (null = model default). */
  effort: ReasoningEffort | null;
  /** The tab's SDK permission mode (default / plan / auto-accept). */
  permissionMode: PermissionMode;
  /** Models offered by the picker (loaded lazily from the main process). */
  availableModels: ModelOption[];
  /** Skills the session can run — feeds the composer's `/` menu and the pin picker. */
  skills: SkillOption[];
  /** True once the session has reported its skills at least once (even if empty). */
  skillsLoaded: boolean;
  /** True while the first skills fetch is in flight (the session is booting up). */
  skillsLoading: boolean;
  messages: ChatEntry[];
  /** In-flight assistant text for the current turn (replaced by the final message). */
  streamingText: string | null;
  /** What the agent is doing between text, for the activity indicator. */
  activeIndicator: ActivityIndicator | null;
  /** Raw SDK name of the in-flight top-level tool; null when none running.
   * Names the activity indicator ("Reading a file…") the instant a tool starts,
   * before the periodic `toolProgress` tick arrives. */
  activeToolName: string | null;
  /** Live elapsed time for the current top-level tool; null when none running. */
  toolProgress: { toolName: string; elapsedSeconds: number } | null;
  /** Set while the SDK is retrying a transient API failure; null otherwise. */
  apiRetry: { attempt: number; maxRetries: number } | null;
  pendingPermissions: PermissionRequest[];
  pendingQuestions: QuestionRequest[];
  /** Background agents currently running (REPLACE semantics; empty = none). */
  backgroundTasks: BackgroundTask[];
  /** Live enrichment per running background agent, keyed by task id. */
  backgroundTaskDetails: Record<string, BackgroundTaskDetail>;
  error: string | null;
};

///////////////
// Constants //
///////////////

const INITIAL: ChatState = {
  hydrated: false,
  sessionState: ClaudeSessionState.Idle,
  runStartedAt: null,
  sessionId: null,
  cwd: null,
  model: null,
  effort: null,
  permissionMode: PermissionMode.Default,
  // Seed with the curated models so the picker always shows them immediately,
  // even before (or independent of) the live SDK fetch.
  availableModels: CURATED_MODELS,
  skills: [],
  skillsLoaded: false,
  skillsLoading: false,
  messages: [],
  streamingText: null,
  activeIndicator: null,
  activeToolName: null,
  toolProgress: null,
  apiRetry: null,
  pendingPermissions: [],
  pendingQuestions: [],
  backgroundTasks: [],
  backgroundTaskDetails: {},
  error: null,
};

// The reset applied when a tab's chat is cleared — empties the conversation and
// any in-flight/turn state while omitting (thus preserving) the tab's model /
// effort / permission-mode selections, its folder, and its loaded skills. Shared
// by the optimistic `clearChat` action and the authoritative `Cleared` reducer.
const CLEARED_PATCH: Partial<ChatState> = {
  messages: [],
  sessionId: null,
  sessionState: ClaudeSessionState.Idle,
  runStartedAt: null,
  streamingText: null,
  activeIndicator: null,
  activeToolName: null,
  toolProgress: null,
  apiRetry: null,
  pendingPermissions: [],
  pendingQuestions: [],
  backgroundTasks: [],
  backgroundTaskDetails: {},
  error: null,
};

/////////////
// Helpers //
/////////////

// One store per tab, plus a guard so each tab binds to the main process exactly
// once. Stores live for the app's lifetime so a backgrounded tab keeps its state
// (and its subscription keeps feeding it) while its component is unmounted.
const stores = new Map<string, StoreApi<ChatState>>();
const started = new Set<string>();

/** The (lazily-created) chat store for a tab. */
function storeFor(tabId: string): StoreApi<ChatState> {
  let store = stores.get(tabId);
  if (!store) {
    store = createStore<ChatState>(() => INITIAL);
    stores.set(tabId, store);
  }
  return store;
}

function pushMessage(state: ChatState, entry: ChatEntry): Partial<ChatState> {
  // Dedupe against hydration/replay by message id.
  if (state.messages.some((m) => m.message.id === entry.message.id)) return {};
  return {
    messages: [...state.messages, entry],
    streamingText: null,
    activeIndicator: null,
    toolProgress: null,
    apiRetry: null,
  };
}

/** True when the user is actively watching `tabId`'s chat right now. */
function isTabWatched(tabId: string): boolean {
  const { activeTabId, viewMode } = useWorkspace.getState();
  return (
    tabId === activeTabId &&
    viewMode === WorkspaceView.Workspace &&
    typeof document !== 'undefined' &&
    document.hasFocus()
  );
}

/**
 * Ping when an agent finishes a turn — the `Running`/`Waiting` → `Idle` edge —
 * but only for a tab the user isn't actively watching, and only if the sound is
 * enabled. Keeps the reducer readable.
 */
function maybePingOnFinish(
  tabId: string,
  prev: ClaudeSessionState,
  next: ClaudeSessionState,
): void {
  const finished =
    (prev === ClaudeSessionState.Running || prev === ClaudeSessionState.Waiting) &&
    next === ClaudeSessionState.Idle;
  if (!finished) return;
  if (!useSettings.getState().soundEnabled) return;
  if (isTabWatched(tabId)) return;
  playPing();
}

/** Fold one ChatEvent into a tab's store. */
function applyEvent(tabId: string, event: ChatEvent): void {
  const set = storeFor(tabId).setState;
  switch (event.kind) {
    case ChatEventKind.Init:
      // A (re)started session has no background agents from a prior process — the
      // level signal is per-process, so reset the set on init.
      set({
        sessionId: event.sessionId,
        model: event.model,
        cwd: event.cwd,
        backgroundTasks: [],
        backgroundTaskDetails: {},
      });
      break;
    case ChatEventKind.TextDelta:
      set((s) => ({
        streamingText: (s.streamingText ?? '') + event.text,
        activeIndicator: null,
        activeToolName: null,
        // Text output means the in-flight step advanced — drop stale progress.
        toolProgress: null,
        apiRetry: null,
      }));
      break;
    case ChatEventKind.BlockStart: {
      const isTool = event.blockType === ChatBlockType.ToolUse;
      set({
        activeIndicator: isTool
          ? ActivityIndicator.Tool
          : event.blockType === ChatBlockType.Thinking
            ? ActivityIndicator.Thinking
            : null,
        activeToolName: isTool ? (event.toolName ?? null) : null,
      });
      break;
    }
    case ChatEventKind.Message:
      set((s) => pushMessage(s, { message: event.message, createdAt: event.createdAt }));
      break;
    case ChatEventKind.State: {
      const prev = storeFor(tabId).getState().sessionState;
      // Start the live timer on the fresh-turn edge only — keep it running when
      // resuming from a permission/question prompt (Waiting → Running) so it
      // reflects total turn time; clear it once the turn finishes or errors.
      const startsTurn =
        event.state === ClaudeSessionState.Running &&
        prev !== ClaudeSessionState.Running &&
        prev !== ClaudeSessionState.Waiting;
      set({
        sessionState: event.state,
        ...(startsTurn ? { runStartedAt: Date.now() } : {}),
        ...(event.state === ClaudeSessionState.Idle || event.state === ClaudeSessionState.Error
          ? { runStartedAt: null }
          : {}),
        // A finished or failed turn has nothing in flight anymore.
        ...(event.state === ClaudeSessionState.Idle || event.state === ClaudeSessionState.Error
          ? {
              streamingText: null,
              activeIndicator: null,
              activeToolName: null,
              toolProgress: null,
              apiRetry: null,
            }
          : {}),
        ...(event.state !== ClaudeSessionState.Error ? { error: null } : {}),
        ...(event.state === ClaudeSessionState.Idle
          ? { pendingPermissions: [], pendingQuestions: [] }
          : {}),
      });
      maybePingOnFinish(tabId, prev, event.state);
      break;
    }
    case ChatEventKind.PermissionRequest:
      set((s) => ({
        pendingPermissions: s.pendingPermissions.some((p) => p.id === event.id)
          ? s.pendingPermissions
          : [
              ...s.pendingPermissions,
              {
                id: event.id,
                toolName: event.toolName,
                input: event.input,
                title: event.title,
                description: event.description,
              },
            ],
      }));
      break;
    case ChatEventKind.PermissionResolved:
      set((s) => ({ pendingPermissions: s.pendingPermissions.filter((p) => p.id !== event.id) }));
      break;
    case ChatEventKind.QuestionRequest:
      set((s) => ({
        pendingQuestions: s.pendingQuestions.some((q) => q.id === event.id)
          ? s.pendingQuestions
          : [...s.pendingQuestions, { id: event.id, questions: event.questions }],
      }));
      break;
    case ChatEventKind.QuestionResolved:
      set((s) => ({ pendingQuestions: s.pendingQuestions.filter((q) => q.id !== event.id) }));
      break;
    case ChatEventKind.Config:
      set({ model: event.model, effort: event.effort, permissionMode: event.permissionMode });
      break;
    case ChatEventKind.Cwd:
      // Folder change resets the session but keeps the persisted transcript
      // (which is what a restart would show anyway).
      set({
        cwd: event.cwd,
        sessionId: null,
        streamingText: null,
        activeIndicator: null,
        activeToolName: null,
      });
      break;
    case ChatEventKind.Cleared:
      // Transcript wiped + session reset in the main process — mirror it here.
      set(CLEARED_PATCH);
      break;
    case ChatEventKind.Title:
      // Tab titles live in the workspace store, not the per-tab chat store.
      useWorkspace.setState((s) => ({
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, title: event.title } : t)),
      }));
      break;
    case ChatEventKind.WorktreeName:
      // Worktree names live in the projects store's per-project worktree lists.
      // The sidebar renders `branch`, so update both the name and the renamed branch.
      useProjects.setState((s) => ({
        worktrees: Object.fromEntries(
          Object.entries(s.worktrees).map(([pid, list]) => [
            pid,
            list.map((w) =>
              w.id === event.workspaceId ? { ...w, name: event.name, branch: event.branch } : w,
            ),
          ]),
        ),
      }));
      break;
    case ChatEventKind.SkillsUpdated:
      // Replace the cached list wholesale — the SDK sends the full set. This is
      // the authoritative "skills are ready" signal (fires even for an empty set).
      set({ skills: event.skills, skillsLoaded: true, skillsLoading: false });
      break;
    case ChatEventKind.ToolProgress:
      set({
        toolProgress: { toolName: event.toolName, elapsedSeconds: event.elapsedSeconds },
        apiRetry: null,
      });
      break;
    case ChatEventKind.ApiRetry:
      set({ apiRetry: { attempt: event.attempt, maxRetries: event.maxRetries } });
      break;
    case ChatEventKind.BackgroundTasks:
      // The level set is authoritative membership — replace it wholesale and
      // prune enrichment for tasks that are no longer running.
      set((s) => {
        const ids = new Set(event.tasks.map((t) => t.id));
        const details: Record<string, BackgroundTaskDetail> = {};
        for (const id of Object.keys(s.backgroundTaskDetails)) {
          if (ids.has(id)) details[id] = s.backgroundTaskDetails[id];
        }
        return { backgroundTasks: event.tasks, backgroundTaskDetails: details };
      });
      break;
    case ChatEventKind.BackgroundTaskProgress:
      // Merge only the defined fields onto the task's existing detail.
      set((s) => {
        const patch: BackgroundTaskDetail = {};
        if (event.subagentType !== undefined) patch.subagentType = event.subagentType;
        if (event.prompt !== undefined) patch.prompt = event.prompt;
        if (event.lastToolName !== undefined) patch.lastToolName = event.lastToolName;
        if (event.totalTokens !== undefined) patch.totalTokens = event.totalTokens;
        if (event.toolUses !== undefined) patch.toolUses = event.toolUses;
        if (event.durationMs !== undefined) patch.durationMs = event.durationMs;
        if (event.summary !== undefined) patch.summary = event.summary;
        return {
          backgroundTaskDetails: {
            ...s.backgroundTaskDetails,
            [event.taskId]: { ...s.backgroundTaskDetails[event.taskId], ...patch },
          },
        };
      });
      break;
    case ChatEventKind.Error:
      set({
        error: event.message,
        streamingText: null,
        activeIndicator: null,
        activeToolName: null,
      });
      break;
  }
}

// Tab context — provides the active tab id to the chat component subtree.

const TabContext = createContext<string | null>(null);

/** Provide the active tab id to the chat components rendered below. */
export function TabProvider({ tabId, children }: { tabId: string; children: ReactNode }) {
  return createElement(TabContext.Provider, { value: tabId }, children);
}

/** The tab id of the surrounding TabProvider; throws if used outside one. */
export function useTabId(): string {
  const id = useContext(TabContext);
  if (!id) throw new Error('useTabId must be used within a TabProvider.');
  return id;
}

// Store hooks + sync

/** Select from the surrounding tab's chat store. */
export function useChat<T>(selector: (state: ChatState) => T): T {
  const tabId = useTabId();
  return useStore(storeFor(tabId), selector);
}

/**
 * Bind a tab's chat store to the main process exactly once (same pattern as the
 * old singleton sync, now keyed per tab). Subscribes first and buffers events,
 * then seeds from the snapshot query, then replays the buffer — the message-id
 * dedupe in the reducer closes the subscribe/hydrate race.
 */
export function useChatSync(tabId: string): void {
  useEffect(() => {
    if (started.has(tabId)) return;
    started.add(tabId);

    const store = storeFor(tabId);
    let seeded = false;
    const buffer: ChatEvent[] = [];

    trpc().claude.onEvent.subscribe(
      { tabId },
      {
        onData: (event) => {
          if (seeded) applyEvent(tabId, event);
          else buffer.push(event);
        },
        onError: () => {},
      },
    );

    trpc()
      .claude.snapshot.query({ tabId })
      .then((snapshot) => {
        store.setState({
          hydrated: true,
          sessionState: snapshot.state,
          sessionId: snapshot.sessionId,
          cwd: snapshot.cwd,
          model: snapshot.model,
          effort: snapshot.effort,
          permissionMode: snapshot.permissionMode,
          messages: snapshot.messages,
          pendingPermissions: snapshot.pendingPermissions,
          pendingQuestions: snapshot.pendingQuestions,
          skills: snapshot.skills,
          // A running session already reported its skills; a fresh tab hasn't.
          skillsLoaded: snapshot.skills.length > 0,
        });
        seeded = true;
        for (const event of buffer) applyEvent(tabId, event);
        buffer.length = 0;
      })
      .catch(() => {
        store.setState({ hydrated: true, error: 'Failed to load the session.' });
        seeded = true;
      });

    // Intentionally no cleanup: a tab's binding is app-lifetime by design, so a
    // backgrounded tab keeps receiving events. Returning an unsubscribe here
    // also breaks under React StrictMode's dev double-mount — the first mount's
    // cleanup would kill the only subscription while the `started` guard stops
    // the second mount from re-subscribing.
  }, [tabId]);
}

// Actions

// The image formats the Agent SDK accepts, keyed by MIME string — anything else
// (heic, bmp, svg…) is skipped rather than sent and rejected downstream.
const SUPPORTED_IMAGE_TYPES: Record<string, ImageMediaType> = {
  'image/png': ImageMediaType.Png,
  'image/jpeg': ImageMediaType.Jpeg,
  'image/gif': ImageMediaType.Gif,
  'image/webp': ImageMediaType.Webp,
};

/**
 * Read a pasted/uploaded image `File` into a `ChatImageInput` (raw base64, no
 * `data:` prefix). Resolves `null` for unsupported types or read failures so the
 * caller can silently skip it. Shared by the composer's paste + upload paths.
 */
export async function fileToChatImage(file: File): Promise<ChatImageInput | null> {
  const mediaType = SUPPORTED_IMAGE_TYPES[file.type];
  if (!mediaType) return null;
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const comma = dataUrl.indexOf(',');
    const data = comma >= 0 ? dataUrl.slice(comma + 1) : '';
    // Clipboard pastes arrive as a generic `image.png`; uploads keep their name.
    const name = file.name || `image.${mediaType.split('/')[1] ?? 'png'}`;
    return data ? { mediaType, data, name } : null;
  } catch {
    return null;
  }
}

export function sendPrompt(tabId: string, text: string, images?: ChatImageInput[]): void {
  const trimmed = text.trim();
  if (!trimmed && !images?.length) return;
  storeFor(tabId).setState({ error: null });
  void trpc().claude.send.mutate({ tabId, text: trimmed, images });
}

export function interruptSession(tabId: string): void {
  void trpc().claude.interrupt.mutate({ tabId });
}

/**
 * Clear a tab's chat (Claude Code's `/clear`): wipe the conversation and start a
 * fresh session. Resets the store optimistically for instant feedback; the main
 * process wipes the transcript + session and echoes back a `Cleared` event that
 * reconciles authoritatively.
 */
export function clearChat(tabId: string): void {
  storeFor(tabId).setState(CLEARED_PATCH);
  void trpc().claude.clear.mutate({ tabId });
}

// Focus bus — lets a keyboard shortcut focus the active tab's composer without
// threading a ref through the component tree. Only the active tab's InputBar is
// mounted, so a bare window event reaches exactly the right textarea.

const FOCUS_INPUT_EVENT = 'flowstate:focus-input';

/** Ask the mounted composer to focus itself. */
export function focusInput(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FOCUS_INPUT_EVENT));
}

/** Run `handler` whenever `focusInput()` is called (used by the composer). */
export function useFocusInput(handler: () => void): void {
  useEffect(() => {
    window.addEventListener(FOCUS_INPUT_EVENT, handler);
    return () => window.removeEventListener(FOCUS_INPUT_EVENT, handler);
  }, [handler]);
}

// Prefill bus — lets the Skills & Actions panel drop text (a `/skill ` invocation
// or an action's prompt) into the active tab's composer without a shared ref.
// Like the focus bus, only the active tab's InputBar is mounted, so a bare window
// event reaches exactly the right textarea; the composer replaces its content,
// focuses, and puts the cursor at the end so the user can add arguments.

const PREFILL_COMPOSER_EVENT = 'flowstate:prefill-composer';

/** Replace the mounted composer's text with `text` and focus it. */
export function prefillComposer(text: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<string>(PREFILL_COMPOSER_EVENT, { detail: text }));
  }
}

/** Run `handler` with the prefill text whenever `prefillComposer()` is called. */
export function usePrefillComposer(handler: (text: string) => void): void {
  useEffect(() => {
    const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
    window.addEventListener(PREFILL_COMPOSER_EVENT, listener);
    return () => window.removeEventListener(PREFILL_COMPOSER_EVENT, listener);
  }, [handler]);
}

export function respondPermission(
  tabId: string,
  requestId: string,
  behavior: PermissionBehavior,
  message?: string,
  // Applied on an Allow — the plan-approval buttons pass the mode to switch into.
  permissionMode?: PermissionMode,
): void {
  void trpc().claude.respondPermission.mutate({
    tabId,
    requestId,
    behavior,
    message,
    permissionMode,
  });
}

/** Answer a pending AskUserQuestion (question text → chosen/typed answer). */
export function answerQuestion(
  tabId: string,
  requestId: string,
  answers: Record<string, string>,
): void {
  void trpc().claude.answerQuestion.mutate({ tabId, requestId, answers });
}

/**
 * Load the model list for a tab's picker. Merges the live result onto the
 * curated base so the picker never shrinks below the curated models even if the
 * SDK reports a narrow set (or the request fails).
 */
export function loadSupportedModels(tabId: string): void {
  void trpc()
    .claude.supportedModels.query({ tabId })
    .then((models) => storeFor(tabId).setState({ availableModels: mergeModelOptions(models) }))
    .catch(() => {});
}

/**
 * Load the skill list for a tab (the composer's `/` menu + the pin picker). The
 * first call boots the session, so skills can take a moment to arrive: this sets
 * `skillsLoading` for the menu's loading state and either finishes here (if the
 * session was already up) or lets the `SkillsUpdated` event finish it. A timeout
 * clears the spinner if the session never reports (e.g. an SDK error). No-op once
 * skills have loaded or a load is already in flight.
 */
export function loadSupportedSkills(tabId: string): void {
  const store = storeFor(tabId);
  const { skillsLoaded, skillsLoading } = store.getState();
  if (skillsLoaded || skillsLoading) return;
  store.setState({ skillsLoading: true });
  const timeout = setTimeout(() => store.setState({ skillsLoading: false }), 8000);
  void trpc()
    .claude.listSkills.query({ tabId })
    .then((skills) => {
      if (skills.length > 0) {
        clearTimeout(timeout);
        store.setState({ skills, skillsLoaded: true, skillsLoading: false });
      }
      // Otherwise the session is still booting — SkillsUpdated clears the spinner.
    })
    .catch(() => {
      clearTimeout(timeout);
      store.setState({ skillsLoading: false });
    });
}

/** Change a tab's model (optimistic: store updates, main confirms via Config). */
export function setModel(tabId: string, model: string): void {
  storeFor(tabId).setState({ model });
  void trpc().claude.setModel.mutate({ tabId, model });
}

/** Change a tab's reasoning effort. */
export function setEffort(tabId: string, effort: ReasoningEffort): void {
  storeFor(tabId).setState({ effort });
  void trpc().claude.setEffort.mutate({ tabId, effort });
}

/** Set a tab's permission mode (optimistic: store updates, main confirms via Config). */
export function setPermissionMode(tabId: string, permissionMode: PermissionMode): void {
  storeFor(tabId).setState({ permissionMode });
  void trpc().claude.setPermissionMode.mutate({ tabId, permissionMode });
}

// The Shift+Tab cycle order: normal → plan → auto-accept → … so the first shift
// reaches plan mode.
const PERMISSION_MODE_CYCLE: PermissionMode[] = [
  PermissionMode.Default,
  PermissionMode.Plan,
  PermissionMode.BypassPermissions,
];

/** Advance a tab to the next permission mode — the Shift+Tab cycle. */
export function cyclePermissionMode(tabId: string): void {
  const current = storeFor(tabId).getState().permissionMode;
  const idx = PERMISSION_MODE_CYCLE.indexOf(current);
  const next = PERMISSION_MODE_CYCLE[(idx + 1) % PERMISSION_MODE_CYCLE.length];
  setPermissionMode(tabId, next);
}
