/**
 * The GitHub domain — shapes read from the linked account's GitHub API that are
 * not already covered by the project/git domains. Currently the viewer's
 * contribution calendar (the classic last-12-month heatmap on the analytics page).
 */

/** One day cell in the contribution calendar. */
export type GithubContributionDay = {
  /** Calendar day, `YYYY-MM-DD`. */
  day: string;
  /** Number of contributions on that day. */
  count: number;
  /** Heat step 0–4 (0 = none), derived from GitHub's `contributionLevel`. */
  level: number;
};

/**
 * The viewer's contribution calendar for the trailing year — the data behind the
 * GitHub-style heatmap. `weeks` are columns (oldest → newest), each holding up to
 * 7 `days` (Sun → Sat); the first and last week may be partial.
 */
export type GithubContributionCalendar = {
  /** Total contributions across the whole calendar window. */
  totalContributions: number;
  /** Week columns, oldest first. */
  weeks: GithubContributionDay[][];
};
