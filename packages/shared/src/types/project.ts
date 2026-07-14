/**
 * Project domain types — a Project is a GitHub repository the user has brought
 * into FlowState: cloned locally and persisted so it can be reopened. A
 * `GithubRepo` is the lighter shape returned when listing the linked account's
 * repositories (a candidate that has not been cloned/persisted yet). Validation
 * lives in `../schemas/project`.
 */

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
  private: boolean;
  /** Shell command run in each new worktree's Setup terminal (e.g. `bun install`); null until set. */
  setupScript: string | null;
  /** Shell command run in a worktree's Run terminal (e.g. `bun run dev`); null until set. */
  runScript: string | null;
  createdAt: string;
};

/** Input to bring a repo into FlowState (clone + persist). */
export type AddProjectInput = {
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
};

/** Input to set a project's Setup/Run scripts (either may be cleared to null). */
export type UpdateProjectScriptsInput = {
  projectId: string;
  setupScript: string | null;
  runScript: string | null;
};
