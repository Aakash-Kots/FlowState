/**
 * Project domain types — a Project is a GitHub repository the user has brought
 * into FlowState: cloned locally and persisted so it can be reopened. A
 * `GithubRepo` is the lighter shape returned when listing the linked account's
 * repositories (a candidate that has not been cloned/persisted yet). Validation
 * lives in `../schemas/project`.
 */
import type { TerminalKind } from '../enums/terminal';

/** The linked GitHub account itself — its login and profile avatar. */
export type GithubViewer = {
  login: string;
  /** URL of the account's profile picture. */
  avatarUrl: string;
};

/** A repository on the linked GitHub account, as returned by the listing. */
export type GithubRepo = {
  owner: string;
  name: string;
  /** `owner/name`. */
  fullName: string;
  /** HTTPS clone URL, e.g. `https://github.com/owner/name.git`. */
  cloneUrl: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  /** ISO-8601 timestamp of the last push/update; used to sort candidates. */
  updatedAt: string;
};

/** A GitHub repo the user has cloned into FlowState and we persist locally. */
export type Project = {
  id: string;
  name: string;
  owner: string;
  /** `owner/name`. */
  fullName: string;
  cloneUrl: string;
  /** Absolute path to the local clone. */
  localPath: string;
  defaultBranch: string;
  /** Branch new worktrees are cut from, overriding `defaultBranch`; null uses the default. */
  worktreeBaseBranch: string | null;
  private: boolean;
  /** Shell command run in each new worktree's Setup terminal (e.g. `bun install`); null until set. */
  setupScript: string | null;
  /** False keeps `setupScript` but stops it auto-running when a worktree opens. */
  setupScriptEnabled: boolean;
  /** Shell command run in a worktree's Run terminal (e.g. `bun run dev`); null until set. */
  runScript: string | null;
  /** False keeps `runScript` but stops it auto-running when a worktree opens. */
  runScriptEnabled: boolean;
  createdAt: string;
};

/** Input to bring a repo into FlowState (clone + persist). */
export type AddProjectInput = {
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
};

/** Which of a project's two scripts an operation targets. */
export type ProjectScriptKind = TerminalKind.Setup | TerminalKind.Run;

/**
 * Input to set one of a project's two scripts. Both fields are optional so a
 * caller only ever sends what it changed — sending the whole pair would let a
 * stale client silently revert the other field.
 */
export type UpdateProjectScriptInput = {
  projectId: string;
  kind: ProjectScriptKind;
  /** New command; `null` clears it (which also re-enables the slot). */
  command?: string | null;
  /** New auto-run flag. */
  enabled?: boolean;
};

/** Input to set the branch new worktrees are cut from (null falls back to the default). */
export type UpdateProjectBaseBranchInput = {
  projectId: string;
  worktreeBaseBranch: string | null;
};
