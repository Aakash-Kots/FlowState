'use client';

import { cancelCloseTab, confirmCloseTab, useWorkspace } from '@/lib/workspace';
import { ConfirmDialog } from '../ui/ConfirmDialog';

//////////////////
// Primary view //
//////////////////

/**
 * Confirmation shown when closing a chat tab whose agent is still working or
 * waiting on input (via the tab X or ⌘W). Driven by `confirmCloseTabId` on the
 * workspace store; mount once per workspace.
 */
export function CloseTabConfirmDialog() {
  const pending = useWorkspace((s) => s.confirmCloseTabId);
  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) cancelCloseTab();
      }}
      title="Close chat?"
      description="Are you sure you want to close this chat? Its agent is still working — you'll lose the in-progress turn."
      confirmLabel="Close chat"
      destructive
      onConfirm={confirmCloseTab}
    />
  );
}
