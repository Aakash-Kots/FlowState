/**
 * Constants for the pinned Skills & Actions panel, shared across the main
 * process and renderer.
 */
import { BuiltinActionKind } from '../enums/skills';
import type { BuiltinAction } from '../types/skills';

/** Id of the built-in "Commit & Push" action (also its pinned `ref`). */
export const COMMIT_AND_PUSH_ACTION_ID = 'commit-and-push';

/** Id of the built-in "Clear chat" action. */
export const CLEAR_CHAT_ACTION_ID = 'clear-chat';

/**
 * App-shipped panel actions, always present at the bottom of every worktree's
 * Skills & Actions panel. A `Prefill` action drops a canned prompt into the
 * composer; a `ClearChat` action wipes the conversation (behind a confirmation).
 */
export const BUILTIN_ACTIONS: BuiltinAction[] = [
  {
    id: COMMIT_AND_PUSH_ACTION_ID,
    kind: BuiltinActionKind.Prefill,
    label: 'Commit & Push',
    insertText: 'Commit all my changes with a concise message and push to the remote.',
  },
  {
    id: CLEAR_CHAT_ACTION_ID,
    kind: BuiltinActionKind.ClearChat,
    label: 'Clear chat',
  },
];
