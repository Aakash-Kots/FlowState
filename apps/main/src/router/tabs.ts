/**
 * Tab control plane — the Claude chat tabs inside a workspace. `list` seeds a
 * default tab on first open; `create`/`close`/`rename` manage the (≤5) tabs.
 * Chat streaming itself lives in the `claude` router, keyed by tabId.
 */
import { TRPCError } from '@trpc/server';
import {
  DEFAULT_TAB_TITLE,
  MAX_FILE_TABS_PER_WORKSPACE,
  MAX_TABS_PER_WORKSPACE,
  TabKind,
  createTabInputSchema,
  type TabStateChange,
} from '@flowstate/shared';
import { z } from 'zod';
import {
  deleteTab,
  deleteTabTranscript,
  ensureWorkspace,
  getTab,
  listAllTabs,
  listTabs,
  upsertTab,
} from '../store';
import { claudeService } from '../services/claude';
import { makeTab } from '../services/workspaceCreate';
import { publicProcedure, router } from '../trpc';

export const tabsRouter = router({
  // Ensure the workspace exists and always return at least one tab.
  list: publicProcedure.input(z.object({ workspaceId: z.string() })).query(({ input }) => {
    ensureWorkspace(input.workspaceId);
    const existing = listTabs(input.workspaceId);
    if (existing.length > 0) return existing;
    upsertTab(makeTab(input.workspaceId, DEFAULT_TAB_TITLE, 0));
    return listTabs(input.workspaceId);
  }),

  // Every tab's persisted session state across all workspaces — seeds the
  // renderer's status-dot map before the live `claude.onAnyState` stream takes
  // over. Cheap: pure store reads, no transcripts or sessions touched.
  states: publicProcedure.query((): TabStateChange[] =>
    listAllTabs().map((t) => ({ tabId: t.id, workspaceId: t.workspaceId, state: t.claudeState })),
  ),

  create: publicProcedure.input(createTabInputSchema).mutation(({ input }) => {
    ensureWorkspace(input.workspaceId);
    const kind = input.kind ?? TabKind.Chat;
    const tabs = listTabs(input.workspaceId);
    // Chat and file tabs share the strip but have independent caps.
    const sameKind = tabs.filter((t) => t.kind === kind).length;
    const cap = kind === TabKind.File ? MAX_FILE_TABS_PER_WORKSPACE : MAX_TABS_PER_WORKSPACE;
    if (sameKind >= cap) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `A workspace can have at most ${cap} ${kind} tabs.`,
      });
    }
    const position = tabs.reduce((max, t) => Math.max(max, t.position), -1) + 1;
    const title = input.title ?? DEFAULT_TAB_TITLE;
    return upsertTab(makeTab(input.workspaceId, title, position, kind, input.filePath ?? null));
  }),

  rename: publicProcedure
    .input(z.object({ tabId: z.string(), title: z.string().min(1) }))
    .mutation(({ input }) => {
      const tab = getTab(input.tabId);
      if (!tab) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tab not found.' });
      return upsertTab({ ...tab, title: input.title });
    }),

  // Close a tab. Chat tabs also tear down their live session + transcript; file
  // tabs have neither, so they just drop the row.
  close: publicProcedure.input(z.object({ tabId: z.string() })).mutation(({ input }) => {
    const tab = getTab(input.tabId);
    if (tab && tab.kind !== TabKind.File) {
      claudeService.closeSession(input.tabId);
      deleteTabTranscript(input.tabId);
    }
    deleteTab(input.tabId);
  }),
});
