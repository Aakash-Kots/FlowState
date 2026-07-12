'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import {
  ChatBlockType,
  ChatEventKind,
  ClaudeSessionState,
  DEFAULT_WORKSPACE_ID,
  PermissionBehavior,
  type ChatEvent,
  type ChatMessage,
  type PermissionRequest,
} from '@flowstate/shared';
import { ActivityIndicator } from './enums/chat';
import { trpc } from './trpc';

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
  model: string | null;
  messages: ChatEntry[];
  /** In-flight assistant text for the current turn (replaced by the final message). */
  streamingText: string | null;
  /** What the agent is doing between text, for the activity indicator. */
  activeIndicator: ActivityIndicator | null;
  pendingPermissions: PermissionRequest[];
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
  messages: [],
  streamingText: null,
  activeIndicator: null,
  pendingPermissions: [],
  error: null,
};

export const useChat = create<ChatState>(() => INITIAL);

/////////////
// Helpers //
/////////////

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
        ...(event.state === ClaudeSessionState.Idle ? { pendingPermissions: [] } : {}),
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
    case ChatEventKind.Cwd:
      // Folder change resets the session but keeps the persisted transcript
      // (which is what a restart would show anyway).
      set({ cwd: event.cwd, sessionId: null, streamingText: null, activeIndicator: null });
      break;
    case ChatEventKind.Error:
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
      { workspaceId: DEFAULT_WORKSPACE_ID },
      {
        onData: (event) => {
          if (seeded) applyEvent(event);
          else buffer.push(event);
        },
        onError: () => {},
      },
    );

    trpc()
      .claude.snapshot.query({ workspaceId: DEFAULT_WORKSPACE_ID })
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

// actions

export function sendPrompt(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  useChat.setState({ error: null });
  void trpc().claude.send.mutate({ workspaceId: DEFAULT_WORKSPACE_ID, text: trimmed });
}

export function interruptSession(): void {
  void trpc().claude.interrupt.mutate({ workspaceId: DEFAULT_WORKSPACE_ID });
}

export function respondPermission(requestId: string, behavior: PermissionBehavior): void {
  void trpc().claude.respondPermission.mutate({
    workspaceId: DEFAULT_WORKSPACE_ID,
    requestId,
    behavior,
  });
}

export async function pickWorkingFolder(): Promise<void> {
  await trpc().claude.pickCwd.mutate({ workspaceId: DEFAULT_WORKSPACE_ID });
}
