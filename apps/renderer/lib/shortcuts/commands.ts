'use client';

import {
  DEFAULT_WORKSPACE_ID,
  MAX_TABS_PER_WORKSPACE,
  ShortcutCategory,
  ShortcutCommand,
  ShortcutScope,
} from '@flowstate/shared';
import { focusInput, interruptSession } from '../chat';
import {
  closeTab,
  cycleTab,
  cycleViewMode,
  openTab,
  pickWorkingFolder,
  selectTabByIndex,
  useWorkspace,
} from '../workspace';
import { setHelpOpen, setPaletteOpen, useShortcuts } from './store';

///////////
// Types //
///////////

/** A bindable command: display metadata plus the handler `dispatch` invokes. */
export type CommandDef = {
  command: ShortcutCommand;
  label: string;
  category: ShortcutCategory;
  scope: ShortcutScope;
  run: () => void | Promise<void>;
  /** Optional gate — a disabled command is skipped by dispatch and greyed in UI. */
  isEnabled?: () => boolean;
};

/////////////
// Helpers //
/////////////

/** The active tab id, or null when the workspace hasn't hydrated yet. */
function activeTabId(): string | null {
  return useWorkspace.getState().activeTabId;
}

/** View switching only applies to a selected worktree, not the project picker. */
function onWorktree(): boolean {
  return useWorkspace.getState().workspaceId !== DEFAULT_WORKSPACE_ID;
}

function goToTab(index: number): CommandDef['run'] {
  return () => selectTabByIndex(index);
}

///////////////
// Registry  //
///////////////

/** Every command keyed by id. Handlers dispatch through the store-action layer. */
export const COMMANDS: Record<ShortcutCommand, CommandDef> = {
  [ShortcutCommand.OpenCommandPalette]: {
    command: ShortcutCommand.OpenCommandPalette,
    label: 'Open command palette',
    category: ShortcutCategory.App,
    scope: ShortcutScope.Global,
    run: () => setPaletteOpen(true),
  },
  [ShortcutCommand.ShowShortcutsHelp]: {
    command: ShortcutCommand.ShowShortcutsHelp,
    label: 'Show keyboard shortcuts',
    category: ShortcutCategory.App,
    scope: ShortcutScope.Global,
    run: () => setHelpOpen(true),
  },
  [ShortcutCommand.ToggleSidebar]: {
    command: ShortcutCommand.ToggleSidebar,
    label: 'Toggle sidebar',
    category: ShortcutCategory.App,
    scope: ShortcutScope.Global,
    run: () => useShortcuts.getState().sidebarToggle?.(),
  },
  [ShortcutCommand.PickWorkingFolder]: {
    command: ShortcutCommand.PickWorkingFolder,
    label: 'Open working folder…',
    category: ShortcutCategory.App,
    scope: ShortcutScope.Global,
    run: () => pickWorkingFolder(),
  },
  [ShortcutCommand.NewTab]: {
    command: ShortcutCommand.NewTab,
    label: 'New chat tab',
    category: ShortcutCategory.Tabs,
    scope: ShortcutScope.Global,
    run: () => openTab(),
    isEnabled: () => useWorkspace.getState().tabs.length < MAX_TABS_PER_WORKSPACE,
  },
  [ShortcutCommand.CloseTab]: {
    command: ShortcutCommand.CloseTab,
    label: 'Close chat tab',
    category: ShortcutCategory.Tabs,
    scope: ShortcutScope.Global,
    run: () => {
      const id = activeTabId();
      if (id) void closeTab(id);
    },
    isEnabled: () => useWorkspace.getState().tabs.length > 1,
  },
  [ShortcutCommand.NextTab]: {
    command: ShortcutCommand.NextTab,
    label: 'Next tab',
    category: ShortcutCategory.Navigation,
    scope: ShortcutScope.Global,
    run: () => cycleTab(1),
  },
  [ShortcutCommand.PrevTab]: {
    command: ShortcutCommand.PrevTab,
    label: 'Previous tab',
    category: ShortcutCategory.Navigation,
    scope: ShortcutScope.Global,
    run: () => cycleTab(-1),
  },
  [ShortcutCommand.NextView]: {
    command: ShortcutCommand.NextView,
    label: 'Next view (Workspace/Terminals)',
    category: ShortcutCategory.Navigation,
    scope: ShortcutScope.Global,
    run: () => cycleViewMode(1),
    isEnabled: onWorktree,
  },
  [ShortcutCommand.PrevView]: {
    command: ShortcutCommand.PrevView,
    label: 'Previous view (Workspace/Terminals)',
    category: ShortcutCategory.Navigation,
    scope: ShortcutScope.Global,
    run: () => cycleViewMode(-1),
    isEnabled: onWorktree,
  },
  [ShortcutCommand.GoToTab1]: {
    command: ShortcutCommand.GoToTab1,
    label: 'Go to tab 1',
    category: ShortcutCategory.Navigation,
    scope: ShortcutScope.Global,
    run: goToTab(0),
  },
  [ShortcutCommand.GoToTab2]: {
    command: ShortcutCommand.GoToTab2,
    label: 'Go to tab 2',
    category: ShortcutCategory.Navigation,
    scope: ShortcutScope.Global,
    run: goToTab(1),
  },
  [ShortcutCommand.GoToTab3]: {
    command: ShortcutCommand.GoToTab3,
    label: 'Go to tab 3',
    category: ShortcutCategory.Navigation,
    scope: ShortcutScope.Global,
    run: goToTab(2),
  },
  [ShortcutCommand.GoToTab4]: {
    command: ShortcutCommand.GoToTab4,
    label: 'Go to tab 4',
    category: ShortcutCategory.Navigation,
    scope: ShortcutScope.Global,
    run: goToTab(3),
  },
  [ShortcutCommand.GoToTab5]: {
    command: ShortcutCommand.GoToTab5,
    label: 'Go to tab 5',
    category: ShortcutCategory.Navigation,
    scope: ShortcutScope.Global,
    run: goToTab(4),
  },
  [ShortcutCommand.FocusInput]: {
    command: ShortcutCommand.FocusInput,
    label: 'Focus message composer',
    category: ShortcutCategory.Session,
    scope: ShortcutScope.Global,
    run: () => focusInput(),
  },
  [ShortcutCommand.InterruptSession]: {
    command: ShortcutCommand.InterruptSession,
    label: 'Interrupt Claude',
    category: ShortcutCategory.Session,
    scope: ShortcutScope.Global,
    run: () => {
      const id = activeTabId();
      if (id) interruptSession(id);
    },
  },
};

/** The registry as a list, for palette/cheat-sheet iteration. */
export const COMMAND_LIST: CommandDef[] = Object.values(COMMANDS);
