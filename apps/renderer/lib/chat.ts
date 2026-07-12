'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import type {
  ChatEvent,
  ChatMessage,
  ClaudeSessionState,
  PermissionRequest,
} from '@flowstate/shared';
import { trpc } from './trpc';

/** v1 runs a single workspace; worktree-per-workspace comes later. */
export const WORKSPACE_ID = 'default';

export interface ChatEntry {
  message: ChatMessage;
  createdAt: string;
}

interface ChatState {
  /** True once the snapshot query has seeded the store. */
  hydrated: boolean;
  sessionState: ClaudeSessionState;
  sessionId: string | null;
  cwd: string | null;
  model: string | null;
  messages: ChatEntry[];
  /** In-flight assistant text for the current turn (replaced by the final message). */
  streamingText: string | null;
  /** What the agent is doing between text, for the activity indicator. */
  activeIndicator: 'thinking' | 'tool' | null;
  pendingPermissions: PermissionRequest[];
  error: string | null;
}

const INITIAL: ChatState = {
  hydrated: false,
  sessionState: 'idle',
  sessionId: null,
  cwd: null,
  model: null,
  messages: [],
  streamingText: null,
  activeIndicator: null,
  pendingPermissions: [],
  error: null,
};

export const useChat = create<ChatState>(() => INITIAL);

function pushMessage(state: ChatState, entry: ChatEntry): Partial<ChatState> {
  // Dedupe against hydration/replay by message id.
  if (state.messages.some((m) => m.message.id === entry.message.id)) return {};
  return {
    messages: [...state.messages, entry],
    streamingText: null,
    activeIndicator: null,
  };
}

function applyEvent(event: ChatEvent): void {
  const set = useChat.setState;
  switch (event.kind) {
    case 'init':
      set({ sessionId: event.sessionId, model: event.model, cwd: event.cwd });
      break;
    case 'text_delta':
      set((s) => ({ streamingText: (s.streamingText ?? '') + event.text, activeIndicator: null }));
      break;
    case 'block_start':
      set({
        activeIndicator:
          event.blockType === 'thinking' ? 'thinking' : event.blockType === 'tool_use' ? 'tool' : null,
      });
      break;
    case 'message':
      set((s) => pushMessage(s, { message: event.message, createdAt: event.createdAt }));
      break;
    case 'state':
      set({
        sessionState: event.state,
        // A finished or failed turn has nothing in flight anymore.
        ...(event.state === 'idle' || event.state === 'error'
          ? { streamingText: null, activeIndicator: null }
          : {}),
        ...(event.state !== 'error' ? { error: null } : {}),
        ...(event.state === 'idle' ? { pendingPermissions: [] } : {}),
      });
      break;
    case 'permission_request':
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
    case 'permission_resolved':
      set((s) => ({ pendingPermissions: s.pendingPermissions.filter((p) => p.id !== event.id) }));
      break;
    case 'cwd':
      // Folder change resets the session but keeps the persisted transcript
      // (which is what a restart would show anyway).
      set({ cwd: event.cwd, sessionId: null, streamingText: null, activeIndicator: null });
      break;
    case 'error':
      set({ error: event.message, streamingText: null, activeIndicator: null });
      break;
  }
}

let started = false;

/**
 * Bind the chat store to the main process exactly once for the app's lifetime
 * (same pattern as useOnboardingSync). Subscribes first and buffers events,
 * then seeds from the snapshot query, then replays the buffer — the message-id
 * dedupe in the reducer closes the subscribe/hydrate race.
 */
export function useChatSync(): void {
  useEffect(() => {
    if (started) return;
    started = true;

    let seeded = false;
    const buffer: ChatEvent[] = [];

    trpc().claude.onEvent.subscribe(
      { workspaceId: WORKSPACE_ID },
      {
        onData: (event) => {
          if (seeded) applyEvent(event);
          else buffer.push(event);
        },
        onError: () => {},
      },
    );

    trpc()
      .claude.snapshot.query({ workspaceId: WORKSPACE_ID })
      .then((snapshot) => {
        useChat.setState({
          hydrated: true,
          sessionState: snapshot.state,
          sessionId: snapshot.sessionId,
          cwd: snapshot.cwd,
          model: snapshot.model,
          messages: snapshot.messages,
          pendingPermissions: snapshot.pendingPermissions,
        });
        seeded = true;
        for (const event of buffer) applyEvent(event);
        buffer.length = 0;
      })
      .catch(() => {
        useChat.setState({ hydrated: true, error: 'Failed to load the session.' });
        seeded = true;
      });

    // Intentionally no cleanup: this binding is app-lifetime by design.
    // Returning an unsubscribe here breaks under React StrictMode's dev
    // double-mount — the first mount's cleanup kills the only subscription
    // while the `started` guard stops the second mount from re-subscribing,
    // leaving the UI deaf to live events until a reload.
  }, []);
}

// ---- actions ---------------------------------------------------------------

export function sendPrompt(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  useChat.setState({ error: null });
  void trpc().claude.send.mutate({ workspaceId: WORKSPACE_ID, text: trimmed });
}

export function interruptSession(): void {
  void trpc().claude.interrupt.mutate({ workspaceId: WORKSPACE_ID });
}

export function respondPermission(requestId: string, behavior: 'allow' | 'deny'): void {
  void trpc().claude.respondPermission.mutate({ workspaceId: WORKSPACE_ID, requestId, behavior });
}

export async function pickWorkingFolder(): Promise<void> {
  await trpc().claude.pickCwd.mutate({ workspaceId: WORKSPACE_ID });
}
