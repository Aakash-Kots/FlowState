'use client';

import { useState } from 'react';
import type { ClaudeSessionState } from '@flowstate/shared';
import { pickWorkingFolder, useChat, useChatSync } from '@/lib/chat';
import { Button } from '../ui/Button';
import { type ConnStatus, StatusPill } from '../ui/StatusPill';
import { ChatView } from './ChatView';
import { InputBar } from './InputBar';

const STATE_PILL: Record<ClaudeSessionState, { status: ConnStatus; label: string }> = {
  idle: { status: 'idle', label: 'Ready' },
  running: { status: 'pending', label: 'Working…' },
  waiting: { status: 'pending', label: 'Needs input' },
  error: { status: 'error', label: 'Error' },
};

function shortenPath(path: string): string {
  const home = path.match(/^\/(?:Users|home)\/[^/]+/);
  return home ? path.replace(home[0], '~') : path;
}

/**
 * The whole post-onboarding workspace: one full-screen Claude Code session —
 * header with session status, streamed conversation, custom input bar.
 */
export function ChatWorkspace() {
  useChatSync();
  const hydrated = useChat((s) => s.hydrated);
  const sessionState = useChat((s) => s.sessionState);
  const cwd = useChat((s) => s.cwd);
  const model = useChat((s) => s.model);
  const [picking, setPicking] = useState(false);

  const pill = STATE_PILL[sessionState];
  const idle = sessionState === 'idle' || sessionState === 'error';

  const pickFolder = async () => {
    setPicking(true);
    try {
      await pickWorkingFolder();
    } finally {
      setPicking(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-base text-sm text-muted">
        Loading session…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-base">
      <div className="flex items-center justify-between border-b border-edge px-5 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <StatusPill status={pill.status} label={pill.label} />
          {cwd && (
            <button
              type="button"
              onClick={pickFolder}
              disabled={!idle || picking}
              title={idle ? 'Change folder (starts a new session)' : 'Stop the current turn to change folders'}
              className="truncate font-mono text-xs text-muted transition-colors hover:text-neutral-200 disabled:cursor-not-allowed disabled:hover:text-muted"
            >
              {shortenPath(cwd)}
            </button>
          )}
        </div>
        {model && <span className="shrink-0 text-xs text-muted">{model}</span>}
      </div>

      {cwd ? (
        <ChatView />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="max-w-sm rounded-lg border border-edge bg-surface p-6 text-center">
            <h2 className="mb-1 text-sm font-semibold text-neutral-100">Choose a working folder</h2>
            <p className="mb-4 text-xs leading-relaxed text-muted">
              Claude Code runs against a folder on your machine — it reads, edits, and runs commands
              there (with your approval).
            </p>
            <Button onClick={pickFolder} disabled={picking}>
              {picking ? 'Choosing…' : 'Pick a folder'}
            </Button>
          </div>
        </div>
      )}

      <InputBar disabled={!cwd} />
    </div>
  );
}
