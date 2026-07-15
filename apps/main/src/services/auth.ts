/**
 * AuthService — drives the onboarding "Connect" flow for Claude Code and GitHub.
 *
 * The user runs the real `claude auth login` / `gh auth login` inside the
 * embedded terminal (so the browser OAuth is visible and interactive). We detect
 * completion by polling each CLI's *authoritative, token-free* status command
 * (`claude auth status`, `gh auth token`) rather than scraping pty output —
 * which is robust across CLI versions and across the Keychain-vs-file credential
 * backends (on macOS Claude stores its credential in the Keychain, so a file
 * watch would never fire).
 *
 * On success we persist a flag / secret and emit a `status` event that the
 * onboarding router forwards to the renderer over a tRPC subscription.
 */
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SecretName } from '../lib/enums/secret';
import type { OnboardingStatus } from '../lib/types/onboarding';
import { getSetting, setSetting } from '../store/settings';
import { deleteSecret, getSecret, hasSecret, setSecret } from '../store/secrets';
import { runLinearOAuth } from './linear-oauth';
import { terminalService } from './terminal';

///////////////
// Constants //
///////////////

const CLAUDE_CONNECTED_KEY = 'claude.connected';
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

/////////////
// Helpers //
/////////////

const execFileAsync = promisify(execFile);

/** Run a command through the user's login shell so PATH matches their terminal. */
async function loginShell(
  command: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const shell = process.env.SHELL ?? '/bin/zsh';
  try {
    const { stdout, stderr } = await execFileAsync(shell, ['-lic', command], {
      env: process.env,
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof e.code === 'number' ? e.code : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    };
  }
}

/** Persist a GitHub token via safeStorage (only ciphertext hits SQLite). */
function storeGithubToken(token: string): void {
  if (!token) return;
  if (getSecret(SecretName.GithubToken) === token) return;
  setSecret(SecretName.GithubToken, token);
}

/**
 * Read the Claude Code credential from wherever the CLI stored it: the macOS
 * Keychain item `Claude Code-credentials`, or the `~/.claude/.credentials.json`
 * fallback used on Linux / when no Keychain is available.
 */
async function readClaudeCredential(): Promise<string | null> {
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync(
        'security',
        ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
        { timeout: 10_000 },
      );
      const value = stdout.trim();
      if (value) return value;
    } catch {
      // fall through to the file-based path
    }
  }
  try {
    return await readFile(join(homedir(), '.claude', '.credentials.json'), 'utf8');
  } catch {
    return null;
  }
}

export class AuthService extends EventEmitter {
  private claudePolling = false;
  private githubPolling = false;
  private linearLoginAbort: AbortController | null = null;

  async checkClaude(): Promise<boolean> {
    const { stdout } = await loginShell('claude auth status');
    return /"loggedIn"\s*:\s*true/.test(stdout);
  }

  /** Returns the GitHub token if logged in via `gh`, else null. */
  async readGithubToken(): Promise<string | null> {
    const { code, stdout } = await loginShell('gh auth token');
    const token = stdout.trim();
    return code === 0 && token.length > 0 ? token : null;
  }

  async hasGithubCli(): Promise<boolean> {
    const { code } = await loginShell('command -v gh');
    return code === 0;
  }

  status(): OnboardingStatus {
    return {
      claudeConnected: getSetting<boolean>(CLAUDE_CONNECTED_KEY) === true,
      githubConnected: hasSecret(SecretName.GithubToken),
      linearConnected: hasSecret(SecretName.LinearToken),
    };
  }

  private emitStatus(): OnboardingStatus {
    const status = this.status();
    this.emit('status', status);
    return status;
  }

  /** Live-check both providers, reconcile persisted state, emit, and return it. */
  async refresh(): Promise<OnboardingStatus> {
    const [claudeLive, githubToken] = await Promise.all([
      this.checkClaude(),
      this.readGithubToken(),
    ]);

    if (claudeLive) await this.onClaudeConnected();
    else setSetting(CLAUDE_CONNECTED_KEY, false);

    if (githubToken) storeGithubToken(githubToken);

    return this.emitStatus();
  }

  /** Copy the Claude Code OAuth credential into our safeStorage (best-effort). */
  private async captureClaudeCredentials(): Promise<void> {
    const cred = await readClaudeCredential();
    if (cred) {
      setSecret(SecretName.ClaudeCredentials, cred);
    } else {
      console.warn(
        '[auth] Claude login detected but the credential could not be read for a safeStorage copy; ' +
          'the Agent SDK will still reuse the login in place.',
      );
    }
  }

  private async onClaudeConnected(): Promise<void> {
    setSetting(CLAUDE_CONNECTED_KEY, true);
    if (!hasSecret(SecretName.ClaudeCredentials)) await this.captureClaudeCredentials();
  }

  /**
   * Run `claude auth login` in the given terminal and watch for success. The
   * command is always typed into the terminal first so the user gets immediate,
   * visible feedback (that is the whole point of the button); polling then
   * detects completion — whether from a fresh login or an existing session.
   */
  async beginClaudeLogin(terminalId: string): Promise<OnboardingStatus> {
    const written = terminalService.write(terminalId, 'claude auth login\r');
    if (!written) {
      // pty not ready yet — fall back to a status check so we still make progress
      if (await this.checkClaude()) {
        await this.onClaudeConnected();
        return this.emitStatus();
      }
    }
    this.pollClaude();
    return this.status();
  }

  /** Run `gh auth login` in the given terminal and watch for success. */
  async beginGithubLogin(terminalId: string): Promise<OnboardingStatus> {
    const written = terminalService.write(terminalId, 'gh auth login --git-protocol https --web\r');
    if (!written) {
      const existing = await this.readGithubToken();
      if (existing) {
        storeGithubToken(existing);
        return this.emitStatus();
      }
    }
    this.pollGithub();
    return this.status();
  }

  /** Manual fallback when `gh` is unavailable: store a pasted PAT. */
  setGithubToken(token: string): OnboardingStatus {
    storeGithubToken(token.trim());
    return this.emitStatus();
  }

  /**
   * Log out of Claude so the user can sign into a different account. Runs the
   * CLI logout in the terminal (visible) and clears our persisted state so the
   * Connect button becomes available again.
   */
  async claudeLogout(terminalId: string): Promise<OnboardingStatus> {
    terminalService.write(terminalId, 'claude auth logout\r');
    setSetting(CLAUDE_CONNECTED_KEY, false);
    deleteSecret(SecretName.ClaudeCredentials);
    return this.emitStatus();
  }

  /** Log out of GitHub and clear the stored token so a new account can sign in. */
  async githubLogout(terminalId: string): Promise<OnboardingStatus> {
    terminalService.write(terminalId, 'gh auth logout --hostname github.com\r');
    deleteSecret(SecretName.GithubToken);
    return this.emitStatus();
  }

  /**
   * Link a Linear account via OAuth. Unlike Claude/GitHub there is no CLI, so we
   * run a browser loopback flow (see `runLinearOAuth`). On success the token is
   * encrypted via safeStorage and a `status` event fires; any failure/cancel/
   * timeout leaves the status unchanged so the pill simply stays "Connect".
   */
  async beginLinearLogin(): Promise<OnboardingStatus> {
    if (this.linearLoginAbort) return this.status(); // a flow is already running
    this.linearLoginAbort = new AbortController();
    try {
      const { accessToken } = await runLinearOAuth({ signal: this.linearLoginAbort.signal });
      setSecret(SecretName.LinearToken, accessToken);
      return this.emitStatus();
    } catch (err) {
      console.warn('[auth] Linear login failed/cancelled:', (err as Error).message);
      return this.status();
    } finally {
      this.linearLoginAbort = null;
    }
  }

  /** Cancel an in-flight Linear OAuth flow (tears down the loopback listener). */
  cancelLinearLogin(): OnboardingStatus {
    this.linearLoginAbort?.abort();
    return this.status();
  }

  /** Disconnect Linear and clear the stored token. */
  linearLogout(): OnboardingStatus {
    deleteSecret(SecretName.LinearToken);
    return this.emitStatus();
  }

  private pollClaude(): void {
    if (this.claudePolling) return;
    this.claudePolling = true;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const tick = async (): Promise<void> => {
      if (Date.now() > deadline) {
        this.claudePolling = false;
        return;
      }
      if (await this.checkClaude()) {
        await this.onClaudeConnected();
        this.claudePolling = false;
        this.emitStatus();
        return;
      }
      setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };
    setTimeout(() => void tick(), POLL_INTERVAL_MS);
  }

  private pollGithub(): void {
    if (this.githubPolling) return;
    this.githubPolling = true;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const tick = async (): Promise<void> => {
      if (Date.now() > deadline) {
        this.githubPolling = false;
        return;
      }
      const token = await this.readGithubToken();
      if (token) {
        storeGithubToken(token);
        this.githubPolling = false;
        this.emitStatus();
        return;
      }
      setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };
    setTimeout(() => void tick(), POLL_INTERVAL_MS);
  }
}

/** Shared singleton — the onboarding router and terminal share one instance. */
export const authService = new AuthService();
