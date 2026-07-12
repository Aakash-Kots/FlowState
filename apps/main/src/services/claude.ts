/**
 * ClaudeService — drives Claude Code sessions via @anthropic-ai/claude-agent-sdk.
 * Milestone 4: one session per workspace using the SDK's `query()` with
 * `cwd` set to the worktree; streams text/tool-use/permission events to the
 * renderer and supports interrupt + resume-by-session-id. Auth reuses the
 * user's existing Claude Code login (no separate key prompt when present).
 */
export class ClaudeService {
  constructor(private readonly worktreePath: string) {}

  async start(prompt: string): Promise<never> {
    throw new Error(
      `ClaudeService.start not implemented for ${this.worktreePath}: ${prompt.slice(0, 40)}`,
    );
  }
}
