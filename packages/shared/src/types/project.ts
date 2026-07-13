/**
 * Project domain types — a Project is a GitHub repository the user has brought
 * into FlowState: cloned locally and persisted so it can be reopened. A
 * `GithubRepo` is the lighter shape returned when listing the linked account's
 * repositories (a candidate that has not been cloned/persisted yet). Validation
 * lives in `../schemas/project`.
 */

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
  createdAt: string;
};

/** Input to bring a repo into FlowState (clone + persist). */
export type AddProjectInput = {
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
};
