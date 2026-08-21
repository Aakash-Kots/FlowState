/**
 * Enumerations for the GitHub domain, shared between the main process and the
 * renderer. Values are the wire strings, so they serialize over IPC unchanged.
 */

/**
 * GitHub's fixed contribution-intensity bucket — the `contributionLevel`
 * discriminant every day in a contribution calendar carries. A mirror enum
 * (values byte-identical to GitHub's GraphQL `ContributionLevel`) so we can map
 * a day to a 0–4 heat step without branching on raw strings.
 */
export enum GithubContributionLevel {
  None = 'NONE',
  FirstQuartile = 'FIRST_QUARTILE',
  SecondQuartile = 'SECOND_QUARTILE',
  ThirdQuartile = 'THIRD_QUARTILE',
  FourthQuartile = 'FOURTH_QUARTILE',
}
