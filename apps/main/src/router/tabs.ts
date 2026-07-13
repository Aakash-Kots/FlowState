/**
 * Tab control plane — the Claude chat tabs inside a workspace. `list` seeds a
 * default tab on first open; `create`/`close`/`rename` manage the (≤5) tabs.
 * Chat streaming itself lives in the `claude` router, keyed by tabId.
 */
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import {
  ClaudeSessionState,
  DEFAULT_TAB_TITLE,
  MAX_TABS_PER_WORKSPACE,
  createTabInputSchema,
  type Tab,
} from '@flowstate/shared';
import { z } from 'zod';
import {
  deleteTab,
  deleteTabTranscript,
  ensureWorkspace,
  getTab,
  listTabs,
  upsertTab,
} from '../store';
import { claudeService } from '../services/claude';
import { publicProcedure, router } from '../trpc';

/////////////
// Helpers //
/////////////

/** Build a fresh Idle tab at the given position. */
function makeTab(workspaceId: string, title: string, position: number): Tab {
  return {
    id: randomUUID(),
    workspaceId,
    title,
    claudeState: ClaudeSessionState.Idle,
    claudeSessionId: null,
    model: null,
    effort: null,
    position,
    createdAt: new Date().toISOString(),
  };
}

export const tabsRouter = router({
  // Ensure the workspace exists and always return at least one tab.
  list: publicProcedure.input(z.object({ workspaceId: z.string() })).query(({ input }) => {
    ensureWorkspace(input.workspaceId);
    const existing = listTabs(input.workspaceId);
    if (existing.length > 0) return existing;
    upsertTab(makeTab(input.workspaceId, DEFAULT_TAB_TITLE, 0));
    return listTabs(input.workspaceId);
  }),

  create: publicProcedure.input(createTabInputSchema).mutation(({ input }) => {
    ensureWorkspace(input.workspaceId);
    const tabs = listTabs(input.workspaceId);
    if (tabs.length >= MAX_TABS_PER_WORKSPACE) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `A workspace can have at most ${MAX_TABS_PER_WORKSPACE} tabs.`,
      });
    }
    const position = tabs.reduce((max, t) => Math.max(max, t.position), -1) + 1;
    return upsertTab(makeTab(input.workspaceId, input.title ?? DEFAULT_TAB_TITLE, position));
  }),

  rename: publicProcedure
    .input(z.object({ tabId: z.string(), title: z.string().min(1) }))
    .mutation(({ input }) => {
      const tab = getTab(input.tabId);
      if (!tab) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tab not found.' });
      return upsertTab({ ...tab, title: input.title });
    }),

  // Close a tab: tear down its live session, drop its transcript, delete the row.
  close: publicProcedure.input(z.object({ tabId: z.string() })).mutation(({ input }) => {
    claudeService.closeSession(input.tabId);
    deleteTabTranscript(input.tabId);
    deleteTab(input.tabId);
  }),
});
