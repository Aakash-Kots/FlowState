/**
 * LinearService — talks to Linear via @linear/sdk.
 * Milestone 5: OAuth 2.0 (personal API key as the simple first path), list
 * assigned issues, transition status, and attach branch/PR links back to the
 * issue. Tokens are encrypted with Electron safeStorage before persistence.
 */
export class LinearService {
  async myIssues(): Promise<never> {
    throw new Error('LinearService.myIssues not implemented');
  }
}
