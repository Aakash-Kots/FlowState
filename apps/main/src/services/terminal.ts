/**
 * TerminalService — owns node-pty shells and streams their output to the
 * renderer (xterm.js) over an electron-trpc subscription. For the onboarding
 * milestone this is a single low-throughput login shell; the dedicated
 * high-throughput raw-IPC channel described in ARCHITECTURE.md is deferred to
 * the full multi-tab workspace terminal (milestone 2).
 *
 * node-pty is a native module rebuilt against Electron's ABI via
 * `electron-builder install-app-deps` (same as better-sqlite3).
 */
import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as pty from 'node-pty';

/** A spawned pty and the emitter callers subscribe to for its output. */
interface Session {
  pty: pty.IPty;
  /** 'data' → (chunk: string), 'exit' → (code: number) */
  events: EventEmitter;
}

function defaultShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC ?? 'powershell.exe';
  return process.env.SHELL ?? '/bin/zsh';
}

export class TerminalService {
  private readonly sessions = new Map<string, Session>();

  /**
   * Spawn a login+interactive shell so the user's PATH (nvm, homebrew, the
   * `claude` and `gh` CLIs, etc.) resolves the same way it does in their real
   * terminal. Defaults to the home directory for onboarding.
   *
   * `startupCommand` is auto-typed into the shell once it's up (this is how the
   * Claude Code tab lands the user straight in a running `claude` session — they
   * just start typing instead of typing `claude` first, the way Conductor does).
   * It runs *inside* the interactive shell, so if the program exits the user
   * drops back to a normal prompt.
   */
  spawn(opts: { cwd?: string; cols?: number; rows?: number; startupCommand?: string } = {}): { id: string } {
    const id = randomUUID();
    const shell = defaultShell();
    const args = process.platform === 'win32' ? [] : ['-l', '-i'];
    const child = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
      cwd: opts.cwd ?? homedir(),
      env: process.env as Record<string, string>,
    });

    const events = new EventEmitter();
    child.onData((chunk) => events.emit('data', chunk));
    child.onExit(({ exitCode }) => {
      events.emit('exit', exitCode);
      this.sessions.delete(id);
    });

    this.sessions.set(id, { pty: child, events });

    if (opts.startupCommand) {
      // Give the login shell a beat to source its rc files and print its first
      // prompt, then type the command as if the user did. Guarded so a fast
      // unmount that kills the pty before it's ready doesn't write to a dead fd.
      const command = opts.startupCommand;
      setTimeout(() => {
        if (this.sessions.has(id)) child.write(`${command}\r`);
      }, 300);
    }

    return { id };
  }

  /** Subscribe to a session's output. Returns an unsubscribe function. */
  onData(id: string, cb: (chunk: string) => void): () => void {
    const session = this.sessions.get(id);
    if (!session) return () => {};
    session.events.on('data', cb);
    return () => session.events.off('data', cb);
  }

  /** Notified when the pty exits (or immediately if it is already gone). */
  onExit(id: string, cb: (code: number) => void): () => void {
    const session = this.sessions.get(id);
    if (!session) {
      cb(0);
      return () => {};
    }
    session.events.on('exit', cb);
    return () => session.events.off('exit', cb);
  }

  /** Feed user keystrokes to the pty. Returns false if the pty is not (yet) live. */
  write(id: string, data: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.pty.write(data);
    return true;
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (session && cols > 0 && rows > 0) session.pty.resize(cols, rows);
  }

  kill(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.pty.kill();
    this.sessions.delete(id);
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  /** Kill every live pty — called on app quit. */
  disposeAll(): void {
    for (const { pty: child } of this.sessions.values()) child.kill();
    this.sessions.clear();
  }
}

/** Shared singleton so the terminal router and auth service see the same ptys. */
export const terminalService = new TerminalService();
