/**
 * TerminalService — owns node-pty shells and streams their output to the
 * renderer (xterm.js) over an electron-trpc subscription. Two kinds of caller
 * use it: the onboarding login shell (ephemeral — spawned without an id, killed
 * on unmount) and the persistent workspace terminals (spawned with a stable tab
 * id, kept alive across view/worktree switches, replayed from a scrollback
 * buffer on reattach; torn down only on explicit close or app quit).
 *
 * It also drives the Setup → Run sequence: `runScript` auto-types a project
 * script into a (possibly pre-existing) pty exactly once, and — when asked to
 * track completion — appends a hidden exit-code sentinel so `onComplete` fires
 * with the script's status. That is how the orchestrator knows Setup finished
 * (and whether it succeeded) before it starts Run.
 *
 * node-pty is a native module rebuilt against Electron's ABI via
 * `electron-builder install-app-deps` (same as better-sqlite3).
 */
import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as pty from 'node-pty';

///////////
// Types //
///////////

/** A spawned pty, its output emitter, and a bounded scrollback for reattach. */
type Session = {
  pty: pty.IPty;
  /** 'data' → (chunk: string), 'exit' → (code: number) */
  events: EventEmitter;
  /** Tail of the pty's output, replayed to a (re)attaching renderer. */
  scrollback: string;
  /** True once a startup/injected command has been auto-typed (once per pty). */
  injected: boolean;
  /** Regex matching this session's hidden completion sentinel, or null if untracked. */
  marker: RegExp | null;
  /** The echoed sentinel source to strip from visible output, or null if untracked. */
  markerSource: string | null;
  /** Trailing bytes withheld from the last chunk in case a sentinel is split across chunks. */
  filterCarry: string;
};

/** Options shared by `spawn`/`runScript` when a pty needs creating. */
type SpawnOpts = { id?: string; cwd?: string; cols?: number; rows?: number };

///////////////
// Constants //
///////////////

/**
 * How much recent pty output to retain for replay on reattach (~256 KB). Enough
 * to restore a screenful plus history without letting a chatty dev server grow
 * the buffer without bound.
 */
const SCROLLBACK_LIMIT = 256 * 1024;

/** Let the login shell source its rc files and print a prompt before auto-typing. */
const STARTUP_DELAY_MS = 300;

/** Distinctive lead-in of the completion sentinel; used to detect chunk-split markers. */
const MARKER_LEAD = '__FS_EXIT_';

/**
 * Escape sequences that make the terminal *reply*: OSC color queries
 * (`ESC]11;?`), cursor-position / device-status reports (`ESC[6n`), and
 * device-attributes requests (`ESC[c`). They sit in scrollback verbatim, but
 * replaying them into a freshly-mounted xterm makes it generate answerback
 * responses that get forwarded to the idle shell and echoed as visible garbage
 * (e.g. `11;rgb:1c1c/1a1a/1717;1R`). Stripped from the replay snapshot only —
 * the live stream keeps them so programs that query mid-session still get
 * their answers.
 */
const DEVICE_QUERY_RE = /\x1b\][0-9;]*\?(?:\x07|\x1b\\)|\x1b\[[0-9?;=>]*[nc]/g;

/////////////
// Helpers //
/////////////

function defaultShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC ?? 'powershell.exe';
  return process.env.SHELL ?? '/bin/zsh';
}

/**
 * The source appended to a tracked command. `printf` emits
 * `\n__FS_EXIT_<id>_<code>_FS__\n`, where `<code>` is `$?` — the wrapped
 * command's exit status. Posix-only (macOS is the target); win32 never tracks.
 */
function sentinelSource(id: string): string {
  return `; printf '\\n${MARKER_LEAD}${id}_%d_FS__\\n' "$?"`;
}

/** Matches the *executed* sentinel line (a real digit), never the echoed `%d` source. */
function sentinelRegex(id: string): RegExp {
  return new RegExp(`${MARKER_LEAD}${id}_(\\d+)_FS__`);
}

export class TerminalService {
  private readonly sessions = new Map<string, Session>();
  /** Last observed exit code per terminal id, retained across (re)subscription and respawn. */
  private readonly completions = new Map<string, number>();
  /** Fires `(id, exitCode)` when a tracked command completes — decoupled from session lifetime. */
  private readonly completionBus = new EventEmitter();

  constructor() {
    // One listener per open Setup banner / orchestrator wiring — no leak warning.
    this.completionBus.setMaxListeners(0);
  }

  /**
   * Spawn a login+interactive shell so the user's PATH (nvm, homebrew, the
   * `claude` and `gh` CLIs, etc.) resolves the same way it does in their real
   * terminal. Defaults to the home directory for onboarding.
   *
   * Pass an explicit `id` (the terminal tab id) for a persistent workspace
   * terminal; if that session is already live this is a no-op reattach (the
   * caller replays scrollback via `snapshot`). Without an `id` a fresh ephemeral
   * session is created (the onboarding path).
   *
   * `startupCommand` is auto-typed into the shell once it's up (this is how the
   * onboarding shell lands the user straight in a running session). It runs
   * *inside* the interactive shell, so if the program exits the user drops back
   * to a normal prompt.
   */
  spawn(
    opts: SpawnOpts & { startupCommand?: string } = {},
  ): { id: string } {
    const id = opts.id ?? randomUUID();
    // A persistent terminal that's already running just reattaches — never
    // double-spawn a pty (which would rerun its startup command) for one tab.
    if (this.sessions.has(id)) return { id };

    this.createSession(id, opts);
    if (opts.startupCommand) this.inject(id, opts.startupCommand, { trackCompletion: false });
    return { id };
  }

  /**
   * Ensure a pty exists for `id`, then auto-type `command` exactly once for that
   * pty (the Setup/Run script). Unlike `spawn`, this injects into a session the
   * UI may have already opened as a plain shell — so the orchestrator, not the
   * tab-open, owns when the script runs. `trackCompletion` appends the hidden
   * sentinel so `onComplete` reports the command's exit code.
   */
  runScript(
    id: string,
    command: string,
    opts: SpawnOpts & { trackCompletion?: boolean } = {},
  ): { id: string } {
    if (!this.sessions.has(id)) this.createSession(id, { ...opts, id });
    this.inject(id, command, { trackCompletion: opts.trackCompletion ?? false });
    return { id };
  }

  /**
   * Re-run `command` in an existing (idle, at-prompt) pty — the "Re-run setup
   * script" action. Resets completion tracking and types the command again;
   * `onComplete` fires afresh when it finishes. Falls back to a fresh
   * spawn-and-inject if the pty is gone (e.g. after an app restart).
   */
  rerunScript(
    id: string,
    command: string,
    opts: SpawnOpts & { trackCompletion?: boolean } = {},
  ): { id: string } {
    const session = this.sessions.get(id);
    if (!session) {
      // No live shell to type into — start one from scratch (its `injected`
      // guard is fresh, so the command runs).
      return this.runScript(id, command, opts);
    }
    const track = (opts.trackCompletion ?? false) && process.platform !== 'win32';
    session.marker = track ? sentinelRegex(id) : null;
    session.markerSource = track ? sentinelSource(id) : null;
    session.filterCarry = '';
    this.completions.delete(id);
    const write = track ? `${command.trimEnd()}${session.markerSource}\r` : `${command}\r`;
    // The shell is already at a prompt (the previous run finished), so no
    // startup delay is needed — type it straight in.
    session.pty.write(write);
    return { id };
  }

  /** Spawn the pty + wire its data/exit plumbing. Caller guarantees `id` is not live. */
  private createSession(id: string, opts: SpawnOpts): void {
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
    const session: Session = {
      pty: child,
      events,
      scrollback: '',
      injected: false,
      marker: null,
      markerSource: null,
      filterCarry: '',
    };
    child.onData((chunk) => this.handleData(id, session, chunk));
    child.onExit(({ exitCode }) => {
      events.emit('exit', exitCode);
      this.sessions.delete(id);
    });
    this.sessions.set(id, session);
  }

  /** Auto-type `command` once, optionally wrapped with the completion sentinel. */
  private inject(id: string, command: string, opts: { trackCompletion: boolean }): void {
    const session = this.sessions.get(id);
    if (!session || session.injected) return;
    session.injected = true;

    const track = opts.trackCompletion && process.platform !== 'win32';
    let write = `${command}\r`;
    if (track) {
      session.marker = sentinelRegex(id);
      session.markerSource = sentinelSource(id);
      this.completions.delete(id); // clear any stale exit code while it re-runs
      // Trim trailing whitespace so the appended `; printf …` chains onto the
      // command rather than landing on a fresh (syntax-error) `;`-led line.
      write = `${command.trimEnd()}${session.markerSource}\r`;
    }

    // Give the login shell a beat to source its rc files and print its first
    // prompt, then type the command as if the user did. Guarded so a fast
    // unmount that kills the pty before it's ready doesn't write to a dead fd.
    setTimeout(() => {
      if (this.sessions.has(id)) session.pty.write(write);
    }, STARTUP_DELAY_MS);
  }

  /** Filter the completion sentinel out of a chunk, record completion, then fan out. */
  private handleData(id: string, session: Session, chunk: string): void {
    const visible = session.marker ? this.filterSentinel(id, session, chunk) : chunk;
    if (!visible) return;
    session.scrollback = (session.scrollback + visible).slice(-SCROLLBACK_LIMIT);
    session.events.emit('data', visible);
  }

  /**
   * Strip the hidden sentinel (both the executed result line and the echoed
   * `printf` source) from visible output, recording the exit code when the
   * result line appears. Carries a trailing partial sentinel across chunks so a
   * split marker is never shown and then retroactively erased.
   */
  private filterSentinel(id: string, session: Session, chunk: string): string {
    let s = session.filterCarry + chunk;
    session.filterCarry = '';

    // Executed result line → capture exit code, emit completion, drop the line.
    s = s.replace(new RegExp(session.marker!.source, 'g'), (_m, code: string) => {
      const exitCode = Number(code);
      this.completions.set(id, exitCode);
      this.completionBus.emit(id, exitCode);
      return '';
    });
    // Echoed `; printf …` source on the typed command line → drop it too.
    if (session.markerSource) s = s.split(session.markerSource).join('');

    // Withhold a trailing partial sentinel (an unterminated `__FS_EXIT_…`) so
    // the next chunk can complete and strip it rather than flashing it on screen.
    const lead = s.lastIndexOf(MARKER_LEAD);
    if (lead !== -1 && !s.slice(lead).includes('_FS__')) {
      session.filterCarry = s.slice(lead);
      s = s.slice(0, lead);
    }
    return s;
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

  /**
   * Notified when a tracked command completes: immediately with the last known
   * exit code if one is already recorded, then on every subsequent completion
   * (e.g. a re-run). Independent of session lifetime, so a subscriber that binds
   * before the pty is spawned still receives the first completion.
   */
  onComplete(id: string, cb: (code: number) => void): () => void {
    const known = this.completions.get(id);
    if (known !== undefined) cb(known);
    const handler = (code: number) => cb(code);
    this.completionBus.on(id, handler);
    return () => this.completionBus.off(id, handler);
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
    this.completions.delete(id);
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  /**
   * The retained tail of a session's output, for a (re)attaching renderer to
   * replay before it subscribes to live data. Empty if the session isn't live.
   */
  snapshot(id: string): string {
    const scrollback = this.sessions.get(id)?.scrollback ?? '';
    return scrollback.replace(DEVICE_QUERY_RE, '');
  }

  /** Kill every live pty — called on app quit. */
  disposeAll(): void {
    for (const { pty: child } of this.sessions.values()) child.kill();
    this.sessions.clear();
    this.completions.clear();
  }
}

/** Shared singleton so the terminal router and auth service see the same ptys. */
export const terminalService = new TerminalService();
