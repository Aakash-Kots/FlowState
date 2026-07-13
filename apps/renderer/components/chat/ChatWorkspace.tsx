'use client';

import { useState } from 'react';
import { TabProvider, useChat, useChatSync, useTabId } from '@/lib/chat';
import { pickWorkingFolder } from '@/lib/workspace';
import { Button } from '../ui/Button';
import { ChatView } from './ChatView';
import { InputBar } from './InputBar';

///////////////////
// Sub-components //
///////////////////

/**
 * The body of one tab: the streamed conversation (or a folder-picker empty
 * state) plus the prompt input. Session status lives on the tab bar. Reads the
 * surrounding tab's chat store.
 */
function ChatSession() {
  const tabId = useTabId();
  useChatSync(tabId);
  const hydrated = useChat((s) => s.hydrated);
  const cwd = useChat((s) => s.cwd);
  const [picking, setPicking] = useState(false);

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
      <div className="flex min-h-0 flex-1 items-center justify-center bg-base text-sm text-muted-foreground">
        Loading session…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-base">
      {cwd ? (
        <ChatView />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="max-w-sm rounded-lg border border-edge bg-surface p-6 text-center">
            <h2 className="mb-1 text-sm font-semibold text-neutral-100">Choose a working folder</h2>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
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

/**
 * One agent tab — binds the tab's chat store (via TabProvider) and renders its
 * Claude Code session. All tabs in a workspace share the project's folder.
 */
export function ChatWorkspace({ tabId }: { tabId: string }) {
  return (
    <TabProvider tabId={tabId}>
      <ChatSession />
    </TabProvider>
  );
}
