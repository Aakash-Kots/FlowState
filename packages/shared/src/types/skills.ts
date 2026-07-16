/**
 * Types for the pinned Skills & Actions panel — the per-worktree / per-repo
 * shortcuts the user pins beside a chat. A `PinnedItem` is one persisted pin; a
 * `BuiltinAction` is an app-shipped shortcut (e.g. "Commit & Push") that inserts
 * a canned prompt into the composer. Enums live in `../enums/skills`; validation
 * lives in `../schemas/skills`.
 */
import type { BuiltinActionKind, PinnedItemKind, SkillImportOrigin } from '../enums/skills';

/**
 * One pinned shortcut in a workspace's Skills & Actions panel. Exactly one of
 * `projectId` (repo-scope, shown for every worktree of the repo) or
 * `workspaceId` (worktree-scope) is set. `ref` is the skill name (no leading
 * slash) or the built-in action id; `label` is a display fallback used when a
 * pinned skill isn't currently discovered by the session.
 */
export type PinnedItem = {
  id: string;
  projectId: string | null;
  workspaceId: string | null;
  kind: PinnedItemKind;
  ref: string;
  label: string;
  position: number;
  createdAt: string;
};

/**
 * An app-shipped panel action, discriminated by `kind`. A `Prefill` action drops
 * its `insertText` into the composer (the insert-then-send flow of a pinned
 * skill); a `ClearChat` action runs an in-app command directly, behind a
 * confirmation, and carries no prompt text.
 */
export type BuiltinAction =
  | { id: string; kind: BuiltinActionKind.Prefill; label: string; insertText: string }
  | { id: string; kind: BuiltinActionKind.ClearChat; label: string };

/**
 * A skill `.md` file discovered outside the current worktree that the user can
 * import into it (copied into `.claude/skills/`, committed, pushed, pinned).
 * `sourcePath` is the absolute path to the file; `origin`/`sourceLabel` describe
 * where it came from (a FlowState project, or the global `~/.claude/skills`).
 */
export type ImportableSkill = {
  name: string;
  description: string | null;
  sourcePath: string;
  origin: SkillImportOrigin;
  sourceLabel: string;
};
