'use client';

import { createContext, createElement, useContext, useEffect, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  ChatBlockType,
  ChatEventKind,
  ClaudeSessionState,
  CURATED_MODELS,
  mergeModelOptions,
  PermissionBehavior,
  ReasoningEffort,
  type ChatEvent,
  type ChatMessage,
  type ModelOption,
  type PermissionRequest,
  type QuestionRequest,
} from '@flowstate/shared';
import { ActivityIndicator } from './enums/chat';
import { useProjects } from './projects';
import { trpc } from './trpc';
import { useWorkspace } from './workspace';

///////////
// Types //
///////////

type ChatEntry = {
  message: ChatMessage;
  createdAt: string;
};

type ChatState = {
  /** True once the snapshot query has seeded the store. */
  hydrated: boolean;
  sessionState: ClaudeSessionState;
  sessionId: string | null;
  cwd: string | null;
  /** Effective model for the picker (explicit selection, else last-run default). */
  model: string | null;
  /** Selected reasoning effort (null = model default). */
  effort: ReasoningEffort | null;
  /** Models offered by the picker (loaded lazily from the main process). */
  availableModels: ModelOption[];
  messages: ChatEntry[];
  /** In-flight assistant text for the current turn (replaced by the final message). */
  streamingText: string | null;
  /** What the agent is doing between text, for the activity indicator. */
  activeIndicator: ActivityIndicator | null;
  pendingPermissions: PermissionRequest[];
  pendingQuestions: QuestionRequest[];
  error: string | null;
};

///////////////
// Constants //
///////////////

const INITIAL: ChatState = {
  hydrated: false,
  sessionState: ClaudeSessionState.Idle,
  sessionId: null,
  cwd: null,
  model: null,
  effort: null,
  // Seed with the curated models so the picker always shows them immediately,
  // even before (or independent of) the live SDK fetch.
  availableModels: CURATED_MODELS,
  messages: [],
  streamingText: null,
  activeIndicator: null,
  pendingPermissions: [],
  pendingQuestions: [],
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
  };
}

/** Fold one ChatEvent into a tab's store. */
function applyEvent(tabId: string, event: ChatEvent): void {
  const set = storeFor(tabId).setState;
  switch (event.kind) {
    case ChatEventKind.Init:
      set({ sessionId: event.sessionId, model: event.model, cwd: event.cwd });
      break;
    case ChatEventKind.TextDelta:
      set((s) => ({ streamingText: (s.streamingText ?? '') + event.text, activeIndicator: null }));
      break;
    case ChatEventKind.BlockStart:
      set({
        activeIndicator:
          event.blockType === ChatBlockType.Thinking
            ? ActivityIndicator.Thinking
            : event.blockType === ChatBlockType.ToolUse
              ? ActivityIndicator.Tool
              : null,
      });
      break;
    case ChatEventKind.Message:
      set((s) => pushMessage(s, { message: event.message, createdAt: event.createdAt }));
      break;
    case ChatEventKind.State:
      set({
        sessionState: event.state,
        // A finished or failed turn has nothing in flight anymore.
        ...(event.state === ClaudeSessionState.Idle || event.state === ClaudeSessionState.Error
          ? { streamingText: null, activeIndicator: null }
          : {}),
        ...(event.state !== ClaudeSessionState.Error ? { error: null } : {}),
        ...(event.state === ClaudeSessionState.Idle
          ? { pendingPermissions: [], pendingQuestions: [] }
          : {}),
      });
      break;
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
      set({ model: event.model, effort: event.effort });
      break;
    case ChatEventKind.Cwd:
      // Folder change resets the session but keeps the persisted transcript
      // (which is what a restart would show anyway).
      set({ cwd: event.cwd, sessionId: null, streamingText: null, activeIndicator: null });
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
    case ChatEventKind.Error:
      set({ error: event.message, streamingText: null, activeIndicator: null });
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
          messages: snapshot.messages,
          pendingPermissions: snapshot.pendingPermissions,
          pendingQuestions: snapshot.pendingQuestions,
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

export function sendPrompt(tabId: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  storeFor(tabId).setState({ error: null });
  void trpc().claude.send.mutate({ tabId, text: trimmed });
}

export function interruptSession(tabId: string): void {
  void trpc().claude.interrupt.mutate({ tabId });
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

export function respondPermission(
  tabId: string,
  requestId: string,
  behavior: PermissionBehavior,
): void {
  void trpc().claude.respondPermission.mutate({ tabId, requestId, behavior });
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
