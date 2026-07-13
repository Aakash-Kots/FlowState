/**
 * Terminal domain types — a TerminalTab is one shell inside a workspace
 * (worktree). A workspace holds two always-present default tabs (Setup + Run,
 * driven by the project's scripts) plus up to the shell cap of ad-hoc tabs; all
 * of them share the worktree as their working folder. The persisted tab is
 * distinct from its runtime pty (keyed by the tab id, respawned on demand).
 * Validation lives in `../schemas/terminal`.
 */
import type { TerminalKind } from '../enums/terminal';

/** One terminal slot within a workspace/worktree. */
export type TerminalTab = {
  id: string;
  workspaceId: string;
  title: string;
  kind: TerminalKind;
  /** Command auto-run on spawn (the resolved project script for Setup/Run); null for a plain shell. */
  command: string | null;
  position: number;
  createdAt: string;
};

/** Input to open a new shell terminal in a workspace. */
export type CreateTerminalTabInput = {
  workspaceId: string;
  title?: string;
};
