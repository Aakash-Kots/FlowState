/**
 * ClaudeService — drives Claude Code sessions via @anthropic-ai/claude-agent-sdk.
 *
 * One long-lived SDK `query()` per workspace, fed by an async message queue
 * (streaming-input mode) so a single session supports multi-turn prompts,
 * interrupt, and interactive permission prompts (`canUseTool`). SDK messages
 * are normalized into small JSON-serializable `ChatEvent`s, persisted to the
 * transcript store as they finalize, and fanned out to the renderer over the
 * tRPC `claude.onEvent` subscription (same contract as `terminalService`).
 *
 * Auth reuses the user's existing Claude Code login: the SDK spawns the
 * bundled Claude Code runtime, which reads the same credentials as the CLI.
 *
 * The SDK package is ESM-only while this bundle is CJS, so it is loaded via a
 * real dynamic import() (preserved by Rollup's dynamicImportInCjs) — never a
 * top-level value import.
 *
 * Note on enums: the SDK's own string fields (`message.type`, `message.subtype`,
 * raw content-block `type`, `PermissionResult.behavior`) are the vendor's types
 * and stay as raw strings; only FlowState's own domain strings use the shared
 * enums, mapped explicitly at the boundary.
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  CanUseTool,
  ModelInfo,
  PermissionMode as SdkPermissionMode,
  PermissionResult,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import {
  ChatBlockType,
  ChatEventKind,
  ChatMessageRole,
  ClaudeSessionState,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  DEFAULT_TAB_TITLE,
  PermissionBehavior,
  PermissionMode,
  ReasoningEffort,
  UNTITLED_WORKSPACE_NAME,
  chatMessageSchema,
  mergeModelOptions,
  type ChatBlock,
  type ChatEvent,
  type ChatMessage,
  type ChatSnapshot,
  type ModelOption,
  type PermissionRequest,
  type QuestionItem,
  type QuestionRequest,
  type Tab,
  type TabStateChange,
  type TurnFileChange,
} from '@flowstate/shared';
import {
  appendMessage,
  getTab,
  getTabTranscript,
  getWorkspace,
  listAllTabs,
  listTabs,
  upsertTab,
  upsertWorkspace,
} from '../store';
import { authService } from './auth';
import { GitService } from './git';
import { slugifyTitle, worktreeService } from './worktree';

///////////
// Types //
///////////

type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk');

type PendingPermission = {
  request: PermissionRequest;
  resolve: (result: PermissionResult) => void;
};

/** A pending AskUserQuestion, resolved through the same canUseTool promise. */
type PendingQuestion = {
  request: QuestionRequest;
  resolve: (result: PermissionResult) => void;
};

/** Content-block shapes we care about, accessed defensively (SDK unions are huge). */
type RawBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

///////////////
// Constants //
///////////////

/** The built-in tool Claude uses to ask the user a structured question. */
const ASK_USER_QUESTION_TOOL = 'AskUserQuestion';

const ASSISTANT_ERROR_TEXT: Record<string, string> = {
  authentication_failed:
    'Claude Code is not signed in. Open Connect and sign in with `claude auth login`.',
  billing_error: 'Claude Code reported a billing problem with your account.',
  rate_limit: 'Rate limited by the Claude API — wait a moment and try again.',
  overloaded: 'The Claude API is overloaded — try again shortly.',
};

/** Cheap model + limits for the one-shot auto-title summarizer. */
const TITLE_MODEL = 'claude-haiku-4-5';
const TITLE_TIMEOUT_MS = 20_000;
/** Max chars fed to the summarizer, and max chars of the title it produces. */
const TITLE_SOURCE_MAX_CHARS = 2_000;
const TITLE_MAX_CHARS = 48;
const TITLE_SYSTEM_PROMPT =
  'You name a coding chat. Reply with ONLY a short 3-5 word title in Title Case ' +
  'summarizing the topic — no quotes, punctuation, or preamble.';

/////////////
// Helpers //
/////////////

let sdkModule: Promise<SdkModule> | null = null;
function loadSdk(): Promise<SdkModule> {
  sdkModule ??= import('@anthropic-ai/claude-agent-sdk');
  return sdkModule;
}

/**
 * The tab's opening exchange (first user prompt + first assistant reply) as plain
 * text, clamped, to feed the auto-title summarizer. Returns null if there's no
 * usable text yet. Transcript rows store the normalized `ChatMessage` in `content`.
 */
function firstExchangeText(tabId: string): string | null {
  const transcript = getTabTranscript(tabId);
  const roleText = (role: ChatMessageRole): string => {
    const message = transcript.find((m) => (m.content as ChatMessage | undefined)?.role === role)
      ?.content as ChatMessage | undefined;
    return (message?.blocks ?? [])
      .map((b) => (b.type === ChatBlockType.Text ? b.text : ''))
      .join('')
      .trim();
  };
  const user = roleText(ChatMessageRole.User);
  const assistant = roleText(ChatMessageRole.Assistant);
  const source = [user && `User: ${user}`, assistant && `Assistant: ${assistant}`]
    .filter(Boolean)
    .join('\n\n')
    .trim();
  return source ? source.slice(0, TITLE_SOURCE_MAX_CHARS) : null;
}

/** Normalize the model's reply into a single clean title line, or null. */
function cleanTitle(raw: string): string | null {
  const line = (raw.trim().split('\n')[0] ?? '').replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!line) return null;
  return line.length > TITLE_MAX_CHARS ? `${line.slice(0, TITLE_MAX_CHARS).trim()}…` : line;
}

/**
 * One-shot Haiku summarizer for a tab title. Reuses the SDK's bundled runtime and
 * the user's Claude Code login (no API key), runs a single tool-less turn, and is
 * best-effort: any failure/timeout returns null and the caller keeps "Chat".
 */
async function generateTitle(source: string, cwd: string): Promise<string | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TITLE_TIMEOUT_MS);
  try {
    const sdk = await loadSdk();
    let text = '';
    const query = sdk.query({
      prompt: `Summarize this coding chat as a short title:\n\n${source}`,
      options: {
        cwd,
        model: TITLE_MODEL,
        maxTurns: 1,
        systemPrompt: TITLE_SYSTEM_PROMPT,
        allowedTools: [],
        abortController: abort,
        stderr: () => {},
      },
    });
    for await (const message of query) {
      if (message.type === 'assistant') text += blockText(message.message.content);
    }
    return cleanTitle(text);
  } catch (err) {
    console.warn('[claude] title generation failed', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function blockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b: RawBlock) => (b?.type === 'text' && typeof b.text === 'string' ? b.text : ''))
      .join('');
  }
  return content == null ? '' : JSON.stringify(content);
}

function normalizeAssistantBlocks(content: unknown): ChatBlock[] {
  if (!Array.isArray(content)) return [];
  const blocks: ChatBlock[] = [];
  for (const raw of content as RawBlock[]) {
    switch (raw?.type) {
      case 'text':
        if (raw.text) blocks.push({ type: ChatBlockType.Text, text: raw.text });
        break;
      case 'thinking':
        if (raw.thinking) blocks.push({ type: ChatBlockType.Thinking, text: raw.thinking });
        break;
      case 'tool_use':
        blocks.push({
          type: ChatBlockType.ToolUse,
          id: raw.id ?? randomUUID(),
          name: raw.name ?? 'unknown',
          input: raw.input ?? {},
        });
        break;
      default:
        break; // redacted_thinking etc. — nothing to render
    }
  }
  return blocks;
}

function normalizeToolResultBlocks(content: unknown): ChatBlock[] {
  if (!Array.isArray(content)) return [];
  const blocks: ChatBlock[] = [];
  for (const raw of content as RawBlock[]) {
    if (raw?.type === 'tool_result' && raw.tool_use_id) {
      blocks.push({
        type: ChatBlockType.ToolResult,
        toolUseId: raw.tool_use_id,
        content: blockText(raw.content),
        isError: raw.is_error === true,
      });
    }
  }
  return blocks;
}

const EFFORT_VALUES = new Set<string>(Object.values(ReasoningEffort));

/** Map an SDK `ModelInfo` to the trimmed `ModelOption` the picker needs. */
function toModelOption(info: ModelInfo): ModelOption {
  const levels = (info.supportedEffortLevels ?? []).filter((l): l is ReasoningEffort =>
    EFFORT_VALUES.has(l),
  );
  return {
    value: info.value,
    displayName: info.displayName,
    description: info.description,
    supportsEffort: info.supportsEffort === true && levels.length > 0,
    supportedEffortLevels: levels,
  };
}

/**
 * Normalize an `AskUserQuestion` tool input into our `QuestionItem[]`. Defensive
 * because the SDK input is untyped here; malformed questions are skipped.
 */
function parseQuestions(input: unknown): QuestionItem[] {
  const raw = (input as { questions?: unknown })?.questions;
  if (!Array.isArray(raw)) return [];
  const items: QuestionItem[] = [];
  for (const q of raw as Array<Record<string, unknown>>) {
    if (!q || typeof q.question !== 'string') continue;
    const options = Array.isArray(q.options)
      ? (q.options as Array<Record<string, unknown>>)
          .filter((o) => o && typeof o.label === 'string')
          .map((o) => ({
            label: String(o.label),
            description: typeof o.description === 'string' ? o.description : '',
          }))
      : [];
    items.push({
      header: typeof q.header === 'string' ? q.header : q.question,
      question: q.question,
      multiSelect: q.multiSelect === true,
      options,
    });
  }
  return items;
}

/**
 * Unbounded push queue exposed as an AsyncIterable — the SDK's streaming
 * prompt input. Must never throw or reject: an error escaping the iterator
 * kills the whole session stream with a misleading "aborted" error.
 */
class AsyncMessageQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private pending: ((result: IteratorResult<T>) => void) | null = null;
  private ended = false;

  push(item: T): void {
    if (this.ended) return;
    if (this.pending) {
      const resolve = this.pending;
      this.pending = null;
      resolve({ value: item, done: false });
    } else {
      this.items.push(item);
    }
  }

  end(): void {
    this.ended = true;
    if (this.pending) {
      const resolve = this.pending;
      this.pending = null;
      resolve({ value: undefined as never, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const item = this.items.shift();
        if (item !== undefined) return Promise.resolve({ value: item, done: false });
        if (this.ended) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => {
          this.pending = resolve;
        });
      },
    };
  }
}

class ClaudeSession {
  readonly queue = new AsyncMessageQueue<SDKUserMessage>();
  readonly abort = new AbortController();
  readonly pendingPermissions = new Map<string, PendingPermission>();
  readonly pendingQuestions = new Map<string, PendingQuestion>();
  query: Query | null = null;
  sessionId: string | null = null;
  /** The user's explicit model selection (null = SDK/CLI default). */
  model: string | null = null;
  /** The user's explicit reasoning-effort selection (null = model default). */
  effort: ReasoningEffort | null = null;
  /** This session's SDK permission mode (default / plan / auto-accept). */
  permissionMode: PermissionMode = PermissionMode.Default;
  /** The model the SDK actually ran (from its `init` message; display only). */
  reportedModel: string | null = null;
  /** Set while an interrupt is in flight so error results read as a clean stop. */
  interrupted = false;
  /** Guards one-shot auto-titling so it runs at most once per tab session. */
  titled = false;
  /**
   * Git tree snapshot taken when the current turn started, used to compute the
   * turn's changed files at its `result`. Null between turns; resolves to null if
   * the snapshot failed (best-effort — the summary is simply omitted).
   */
  turnBaseline: Promise<string | null> | null = null;

  constructor(
    readonly tabId: string,
    readonly workspaceId: string,
    readonly cwd: string,
  ) {}
}

export class ClaudeService {
  // Keyed by tabId — each tab is an independent Claude chat session.
  private readonly sessions = new Map<string, ClaudeSession>();
  private readonly events = new EventEmitter();
  // App-wide fan-out of every tab's state transition (the per-tab `events`
  // emitter keys on tabId, so it can't broadcast to a subscriber that doesn't
  // yet know which tabs exist — the sidebar/tab-strip status dots need this).
  private readonly stateEvents = new EventEmitter();

  /**
   * Reset stuck states on startup: no sessions run at boot, so a tab persisted
   * as Running/Waiting (the app quit mid-turn) would otherwise show a live dot
   * forever. Errors are kept so "last run errored" survives a restart.
   */
  reconcileOnStartup(): void {
    for (const tab of listAllTabs()) {
      if (
        tab.claudeState === ClaudeSessionState.Running ||
        tab.claudeState === ClaudeSessionState.Waiting
      ) {
        upsertTab({ ...tab, claudeState: ClaudeSessionState.Idle });
      }
    }
  }

  /** A workspace's working folder — its worktree path (null until it has one). */
  getCwd(workspaceId: string): string | null {
    return getWorkspace(workspaceId)?.worktreePath || null;
  }

  /**
   * Point a workspace at a new folder. Every one of its tabs' sessions (and
   * resume ids) is discarded — resuming under a different cwd is incoherent —
   * while transcripts are kept. Emits Cwd to each of the workspace's tabs.
   */
  setCwd(workspaceId: string, cwd: string): void {
    const ws = getWorkspace(workspaceId);
    if (ws) upsertWorkspace({ ...ws, repoRoot: cwd, worktreePath: cwd });
    for (const tab of listTabs(workspaceId)) {
      this.disposeSession(tab.id);
      const fresh = getTab(tab.id);
      if (fresh) upsertTab({ ...fresh, claudeSessionId: null });
      this.emit(tab.id, { kind: ChatEventKind.Cwd, cwd });
    }
  }

  /** Send a user prompt to a tab's session, starting the session if needed. */
  send(tabId: string, text: string): void {
    const tab = getTab(tabId);
    if (!tab) {
      this.emit(tabId, { kind: ChatEventKind.Error, message: 'This chat tab no longer exists.' });
      return;
    }
    const cwd = this.getCwd(tab.workspaceId);
    if (!cwd) {
      this.emit(tabId, {
        kind: ChatEventKind.Error,
        message: 'This workspace has no worktree folder yet.',
      });
      return;
    }
    if (!authService.status().claudeConnected) {
      this.emit(tabId, {
        kind: ChatEventKind.Error,
        message: 'Claude Code is not connected. Open Connect and sign in first.',
      });
      return;
    }

    const session = this.ensureSession(tab, cwd);
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: ChatMessageRole.User,
      blocks: [{ type: ChatBlockType.Text, text }],
    };
    this.persistAndEmit(session, userMessage);
    this.setState(tabId, ClaudeSessionState.Running);
    // Snapshot the worktree now (before the agent's first edit) so the turn's
    // `result` can report exactly which files this run changed. Best-effort.
    session.turnBaseline = new GitService(cwd).snapshotTree().catch(() => null);
    session.queue.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
    });
  }

  /** Interrupt a tab's in-flight turn (denies any pending permission prompt). */
  async interrupt(tabId: string): Promise<void> {
    const session = this.sessions.get(tabId);
    if (!session) return;
    session.interrupted = true;
    // A pending permission prompt blocks the agent — deny it so the interrupt lands.
    this.resolveAllPermissions(session, {
      behavior: 'deny',
      message: 'Interrupted by the user.',
      interrupt: true,
    });
    try {
      await session.query?.interrupt();
    } catch (err) {
      console.warn('[claude] interrupt failed', err);
    }
    this.setState(tabId, ClaudeSessionState.Idle);
  }

  /**
   * Resolve a pending tool-permission prompt for a tab (allow / deny).
   *
   * `permissionMode`, when set with an `Allow`, is applied right after the
   * approval resolves — this is how the plan-approval buttons switch the session
   * into auto-accept or normal mode. Applying it here (rather than as a separate
   * renderer call) also beats the SDK's own plan→default transition, which
   * otherwise clobbers a pre-set mode when ExitPlanMode is approved.
   */
  respondPermission(
    tabId: string,
    requestId: string,
    behavior: PermissionBehavior,
    message?: string,
    permissionMode?: PermissionMode,
  ): void {
    const session = this.sessions.get(tabId);
    const pending = session?.pendingPermissions.get(requestId);
    if (!session || !pending) return;
    session.pendingPermissions.delete(requestId);
    pending.resolve(
      behavior === PermissionBehavior.Allow
        ? { behavior: 'allow' }
        : { behavior: 'deny', message: message ?? 'The user denied this action.' },
    );
    this.emit(tabId, { kind: ChatEventKind.PermissionResolved, id: requestId, behavior });
    if (behavior === PermissionBehavior.Allow && permissionMode !== undefined) {
      void this.setPermissionMode(tabId, permissionMode);
    }
    this.resumeIfClear(session);
  }

  /** Answer a pending AskUserQuestion prompt for a tab. */
  answerQuestion(tabId: string, requestId: string, answers: Record<string, string>): void {
    const session = this.sessions.get(tabId);
    const pending = session?.pendingQuestions.get(requestId);
    if (!session || !pending) return;
    session.pendingQuestions.delete(requestId);
    pending.resolve(this.buildQuestionAnswer(pending.request, answers));
    this.emit(tabId, { kind: ChatEventKind.QuestionResolved, id: requestId });
    this.resumeIfClear(session);
  }

  /**
   * Models offered to a tab's picker: the curated set always shown, plus any
   * extra models the live SDK reports for this session (deduped by value).
   */
  async getSupportedModels(tabId: string): Promise<ModelOption[]> {
    const session = this.sessions.get(tabId);
    try {
      const infos = await session?.query?.supportedModels();
      return mergeModelOptions((infos ?? []).map(toModelOption));
    } catch (err) {
      console.warn('[claude] supportedModels failed', err);
      return mergeModelOptions([]);
    }
  }

  /** Set a tab's model. Persists it and applies it live if a session exists. */
  async setModel(tabId: string, model: string): Promise<void> {
    const tab = getTab(tabId);
    if (tab) upsertTab({ ...tab, model });
    const session = this.sessions.get(tabId);
    if (session) {
      session.model = model;
      try {
        // Streaming-input sessions can switch model live (no restart needed).
        await session.query?.setModel(model);
      } catch (err) {
        console.warn('[claude] setModel failed', err);
      }
    }
    this.emit(tabId, {
      kind: ChatEventKind.Config,
      model,
      effort: session?.effort ?? tab?.effort ?? null,
      permissionMode: session?.permissionMode ?? tab?.permissionMode ?? PermissionMode.Default,
    });
  }

  /**
   * Set a tab's reasoning effort. The SDK has no live effort setter, so an
   * existing session is torn down; the next send() re-opens it (with `resume`,
   * so the transcript is intact) applying the new effort from the tab record.
   */
  setEffort(tabId: string, effort: ReasoningEffort): void {
    const tab = getTab(tabId);
    if (tab) upsertTab({ ...tab, effort });
    if (this.sessions.has(tabId)) this.disposeSession(tabId);
    this.setState(tabId, ClaudeSessionState.Idle);
    this.emit(tabId, {
      kind: ChatEventKind.Config,
      model: tab?.model ?? null,
      effort,
      permissionMode: tab?.permissionMode ?? PermissionMode.Default,
    });
  }

  /**
   * Set a tab's permission mode. Persists it and applies it live if a session
   * exists — the SDK supports switching `permissionMode` on a running session
   * (like `setModel`), so no teardown is needed.
   */
  async setPermissionMode(tabId: string, permissionMode: PermissionMode): Promise<void> {
    const tab = getTab(tabId);
    if (tab) upsertTab({ ...tab, permissionMode });
    const session = this.sessions.get(tabId);
    if (session) {
      session.permissionMode = permissionMode;
      try {
        // The enum's values are the SDK's `permissionMode` wire strings.
        await session.query?.setPermissionMode(permissionMode as SdkPermissionMode);
      } catch (err) {
        console.warn('[claude] setPermissionMode failed', err);
      }
    }
    this.emit(tabId, {
      kind: ChatEventKind.Config,
      model: session?.model ?? tab?.model ?? null,
      effort: session?.effort ?? tab?.effort ?? null,
      permissionMode,
    });
  }

  /** Subscribe to a tab's ChatEvents; returns an unsubscribe function. */
  onEvent(tabId: string, cb: (event: ChatEvent) => void): () => void {
    this.events.on(tabId, cb);
    return () => this.events.off(tabId, cb);
  }

  /** Subscribe to every tab's state transitions; returns an unsubscribe function. */
  onAnyStateChange(cb: (change: TabStateChange) => void): () => void {
    this.stateEvents.on('change', cb);
    return () => this.stateEvents.off('change', cb);
  }

  /** Hydrate a tab on mount: persisted state, resume id, cwd, and transcript. */
  getSnapshot(tabId: string): ChatSnapshot {
    const tab = getTab(tabId);
    const session = this.sessions.get(tabId);
    const messages: ChatSnapshot['messages'] = [];
    for (const row of getTabTranscript(tabId)) {
      // Rows persisted by older builds may not match the normalized shape — skip them.
      const parsed = chatMessageSchema.safeParse(row.content);
      if (parsed.success) messages.push({ message: parsed.data, createdAt: row.createdAt });
    }
    return {
      state: tab?.claudeState ?? ClaudeSessionState.Idle,
      sessionId: tab?.claudeSessionId ?? null,
      cwd: tab ? this.getCwd(tab.workspaceId) : null,
      // Prefer the explicit selection; fall back to what the last turn ran as.
      model: session ? (session.model ?? session.reportedModel) : (tab?.model ?? null),
      effort: session?.effort ?? tab?.effort ?? null,
      permissionMode: session?.permissionMode ?? tab?.permissionMode ?? PermissionMode.Default,
      messages,
      pendingPermissions: session
        ? [...session.pendingPermissions.values()].map((p) => p.request)
        : [],
      pendingQuestions: session ? [...session.pendingQuestions.values()].map((p) => p.request) : [],
    };
  }

  /** Tear down a single tab's session — called when a tab is closed. */
  closeSession(tabId: string): void {
    this.disposeSession(tabId);
  }

  /** Tear down every session — called on app quit. */
  disposeAll(): void {
    for (const tabId of this.sessions.keys()) this.disposeSession(tabId);
  }

  private ensureSession(tab: Tab, cwd: string): ClaudeSession {
    const existing = this.sessions.get(tab.id);
    if (existing) return existing;

    const session = new ClaudeSession(tab.id, tab.workspaceId, cwd);
    session.sessionId = tab.claudeSessionId;
    session.model = tab.model;
    session.effort = tab.effort;
    session.permissionMode = tab.permissionMode;
    this.sessions.set(tab.id, session);
    void this.run(session, tab.claudeSessionId);
    return session;
  }

  private disposeSession(tabId: string): void {
    const session = this.sessions.get(tabId);
    if (!session) return;
    this.sessions.delete(tabId);
    this.resolveAllPermissions(session, {
      behavior: 'deny',
      message: 'The session was closed.',
      interrupt: true,
    });
    session.queue.end();
    session.abort.abort();
  }

  private async run(session: ClaudeSession, resumeSessionId: string | null): Promise<void> {
    const { tabId } = session;
    try {
      const sdk = await loadSdk();
      session.query = sdk.query({
        prompt: session.queue,
        options: {
          cwd: session.cwd,
          resume: resumeSessionId ?? undefined,
          model: session.model ?? DEFAULT_MODEL,
          effort: session.effort ?? DEFAULT_EFFORT,
          // The enum's values are the SDK's `permissionMode` wire strings.
          permissionMode: session.permissionMode as SdkPermissionMode,
          canUseTool: this.makePermissionHandler(session),
          includePartialMessages: true,
          systemPrompt: { type: 'preset', preset: 'claude_code' },
          settingSources: ['user'],
          abortController: session.abort,
          stderr: (data) => console.warn('[claude:stderr]', data),
        },
      });

      for await (const message of session.query) {
        await this.handleSdkMessage(session, message);
      }
      // Stream ended cleanly (queue ended / abort). Nothing more to do.
    } catch (err) {
      if (!this.sessions.has(tabId)) return; // torn down deliberately
      const text = err instanceof Error ? err.message : String(err);
      console.error('[claude] session crashed:', text);
      this.emit(tabId, {
        kind: ChatEventKind.Error,
        message: `Claude session error: ${text}`,
      });
      this.setState(tabId, ClaudeSessionState.Error);
      // Drop the broken session; the next send() starts fresh and resumes.
      this.sessions.delete(tabId);
      this.resolveAllPermissions(session, {
        behavior: 'deny',
        message: 'The session ended.',
        interrupt: true,
      });
      session.queue.end();
    }
  }

  private async handleSdkMessage(session: ClaudeSession, message: SDKMessage): Promise<void> {
    const { tabId } = session;
    switch (message.type) {
      case 'system': {
        if (message.subtype === 'init') {
          session.sessionId = message.session_id;
          session.reportedModel = message.model;
          const tab = getTab(tabId);
          if (tab) upsertTab({ ...tab, claudeSessionId: message.session_id });
          this.emit(tabId, {
            kind: ChatEventKind.Init,
            sessionId: message.session_id,
            model: message.model,
            cwd: message.cwd,
          });
        } else if (message.subtype === 'session_state_changed') {
          const state: ClaudeSessionState =
            message.state === 'requires_action'
              ? ClaudeSessionState.Waiting
              : message.state === 'running'
                ? ClaudeSessionState.Running
                : ClaudeSessionState.Idle;
          this.setState(tabId, state);
        }
        break;
      }

      case 'stream_event': {
        if (message.parent_tool_use_id !== null) break; // subagent chatter
        const event = message.event as {
          type?: string;
          delta?: RawBlock;
          content_block?: RawBlock;
        };
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          if (event.delta.text) {
            this.emit(tabId, { kind: ChatEventKind.TextDelta, text: event.delta.text });
          }
        } else if (event.type === 'content_block_start' && event.content_block?.type) {
          this.emit(tabId, {
            kind: ChatEventKind.BlockStart,
            blockType: event.content_block.type,
          });
        }
        break;
      }

      case 'assistant': {
        if (message.parent_tool_use_id !== null) break; // subagent messages
        if (message.error) {
          this.emit(tabId, {
            kind: ChatEventKind.Error,
            message:
              ASSISTANT_ERROR_TEXT[message.error] ?? `Claude returned an error: ${message.error}`,
          });
          this.setState(tabId, ClaudeSessionState.Error);
          break;
        }
        const blocks = normalizeAssistantBlocks(message.message.content);
        if (blocks.length === 0) break;
        this.persistAndEmit(session, { id: message.uuid, role: ChatMessageRole.Assistant, blocks });
        break;
      }

      case 'user': {
        // Only tool results are interesting here — the user's own prompts are
        // persisted in send(), and replayed history would duplicate them.
        if (message.parent_tool_use_id !== null) break;
        const blocks = normalizeToolResultBlocks(message.message.content);
        if (blocks.length === 0) break;
        const id = 'uuid' in message && message.uuid ? String(message.uuid) : randomUUID();
        this.persistAndEmit(session, { id, role: ChatMessageRole.Tool, blocks });
        break;
      }

      case 'result': {
        const isError = message.subtype !== 'success' && !session.interrupted;
        const blocks: ChatBlock[] =
          message.subtype === 'success' || session.interrupted
            ? []
            : [
                {
                  type: ChatBlockType.Text,
                  text: message.errors.join('\n') || `Run failed: ${message.subtype}`,
                },
              ];
        const fileChanges = await this.turnFileChanges(session);
        this.persistAndEmit(session, {
          id: message.uuid,
          role: ChatMessageRole.Result,
          blocks,
          meta: {
            costUsd: message.total_cost_usd,
            durationMs: message.duration_ms,
            numTurns: message.num_turns,
            isError,
            ...(fileChanges ? { fileChanges } : {}),
          },
        });
        session.interrupted = false;
        this.setState(tabId, ClaudeSessionState.Idle);
        // Auto-title the tab from its opening exchange (fire-and-forget, once).
        if (message.subtype === 'success') void this.maybeGenerateTitle(session);
        break;
      }

      default:
        break; // the SDKMessage union is huge — ignore everything else
    }
  }

  private makePermissionHandler(session: ClaudeSession): CanUseTool {
    return (toolName, input, options) =>
      toolName === ASK_USER_QUESTION_TOOL
        ? this.handleQuestion(session, input, options.signal)
        : this.handlePermission(session, toolName, input, options);
  }

  /** Park a normal tool-permission prompt until the user allows/denies it. */
  private handlePermission(
    session: ClaudeSession,
    toolName: string,
    input: unknown,
    options: { title?: string; description?: string; signal: AbortSignal },
  ): Promise<PermissionResult> {
    return new Promise<PermissionResult>((resolve) => {
      const request: PermissionRequest = {
        id: randomUUID(),
        toolName,
        input,
        title: options.title,
        description: options.description,
      };
      session.pendingPermissions.set(request.id, { request, resolve });
      this.setState(session.tabId, ClaudeSessionState.Waiting);
      this.emit(session.tabId, { kind: ChatEventKind.PermissionRequest, ...request });

      options.signal.addEventListener('abort', () => {
        if (!session.pendingPermissions.delete(request.id)) return;
        this.emit(session.tabId, {
          kind: ChatEventKind.PermissionResolved,
          id: request.id,
          behavior: PermissionBehavior.Deny,
        });
        resolve({ behavior: 'deny', message: 'The request was cancelled.' });
      });
    });
  }

  /** Park an AskUserQuestion prompt until the user answers it near the input. */
  private handleQuestion(
    session: ClaudeSession,
    input: unknown,
    signal: AbortSignal,
  ): Promise<PermissionResult> {
    return new Promise<PermissionResult>((resolve) => {
      const request: QuestionRequest = { id: randomUUID(), questions: parseQuestions(input) };
      session.pendingQuestions.set(request.id, { request, resolve });
      this.setState(session.tabId, ClaudeSessionState.Waiting);
      this.emit(session.tabId, { kind: ChatEventKind.QuestionRequest, ...request });

      signal.addEventListener('abort', () => {
        if (!session.pendingQuestions.delete(request.id)) return;
        this.emit(session.tabId, { kind: ChatEventKind.QuestionResolved, id: request.id });
        resolve({ behavior: 'deny', message: 'The question was cancelled.' });
      });
    });
  }

  /**
   * Turn the user's answers into the result the SDK gets for an AskUserQuestion
   * tool call. The exact contract is undocumented in the SDK types, so the
   * answers are fed back as a deny `message` (the reliable channel already used
   * for permission denials) — the model reads the message and continues. If a
   * live `{ behavior: 'allow', updatedInput }` contract is confirmed, swap it
   * here; this is the single place that shape lives.
   */
  private buildQuestionAnswer(
    request: QuestionRequest,
    answers: Record<string, string>,
  ): PermissionResult {
    const lines = request.questions.map((q) => {
      const answer = answers[q.question] ?? answers[q.header] ?? '(no answer)';
      return `- ${q.header}: ${answer}`;
    });
    return {
      behavior: 'deny',
      message: `The user answered your question(s):\n${lines.join('\n')}\n\nContinue using these answers.`,
    };
  }

  /** Return a tab to Running once no permission or question prompt is pending. */
  private resumeIfClear(session: ClaudeSession): void {
    if (session.pendingPermissions.size === 0 && session.pendingQuestions.size === 0) {
      this.setState(session.tabId, ClaudeSessionState.Running);
    }
  }

  private resolveAllPermissions(session: ClaudeSession, result: PermissionResult): void {
    for (const [id, pending] of session.pendingPermissions) {
      pending.resolve(result);
      this.emit(session.tabId, {
        kind: ChatEventKind.PermissionResolved,
        id,
        behavior: result.behavior === 'allow' ? PermissionBehavior.Allow : PermissionBehavior.Deny,
      });
    }
    session.pendingPermissions.clear();
    // Any parked questions belong to the same interrupted/torn-down turn.
    for (const [id, pending] of session.pendingQuestions) {
      pending.resolve(result);
      this.emit(session.tabId, { kind: ChatEventKind.QuestionResolved, id });
    }
    session.pendingQuestions.clear();
  }

  /**
   * Derive a concise name from the opening exchange (one Haiku call) and apply it
   * to both the tab title and — for a fresh worktree — the workspace's display
   * name, at most once per session. Each target updates only while it still holds
   * its default ("Chat" / "Untitled"), so a manual rename always wins. Best-effort:
   * failures leave both untouched.
   */
  private async maybeGenerateTitle(session: ClaudeSession): Promise<void> {
    if (session.titled) return;
    session.titled = true;
    const source = firstExchangeText(session.tabId);
    if (!source) return;
    const name = await generateTitle(source, session.cwd);
    if (!name) return;
    // Re-check each target after the async summarization — the user may have
    // renamed the tab or the worktree while we were summarizing.
    const tab = getTab(session.tabId);
    if (tab && tab.title === DEFAULT_TAB_TITLE) {
      upsertTab({ ...tab, title: name });
      this.emit(session.tabId, { kind: ChatEventKind.Title, title: name });
    }
    const workspace = getWorkspace(session.workspaceId);
    if (workspace && workspace.name === UNTITLED_WORKSPACE_NAME) {
      // Rename the throwaway random branch (e.g. `brave-lark`) to a slug of the
      // title. Best-effort: a git failure keeps the old branch and never breaks
      // the chat.
      let branch = workspace.branch;
      try {
        branch = await worktreeService.renameBranch({
          repoRoot: workspace.repoRoot,
          oldBranch: workspace.branch,
          newBranch: slugifyTitle(name),
        });
      } catch (err) {
        console.warn('[claude] branch rename failed', err);
      }
      upsertWorkspace({ ...workspace, name, branch });
      this.emit(session.tabId, {
        kind: ChatEventKind.WorktreeName,
        workspaceId: workspace.id,
        name,
        branch,
      });
    }
  }

  /**
   * The files the just-finished turn changed, diffing the worktree against the
   * snapshot taken in `send()`. Best-effort: returns undefined when there was no
   * baseline, nothing changed, or git failed — the summary is then omitted.
   */
  private async turnFileChanges(session: ClaudeSession): Promise<TurnFileChange[] | undefined> {
    const baseline = session.turnBaseline;
    session.turnBaseline = null;
    if (!baseline) return undefined;
    try {
      const from = await baseline;
      if (!from) return undefined;
      const changes = await new GitService(session.cwd).turnDiff(from);
      return changes.length > 0 ? changes : undefined;
    } catch (err) {
      console.warn('[claude] turn diff failed', err);
      return undefined;
    }
  }

  private persistAndEmit(session: ClaudeSession, message: ChatMessage): void {
    const createdAt = new Date().toISOString();
    appendMessage(session.tabId, session.workspaceId, session.sessionId ?? 'pending', {
      role: message.role,
      content: message,
      createdAt,
    });
    this.emit(session.tabId, { kind: ChatEventKind.Message, message, createdAt });
  }

  private setState(tabId: string, state: ClaudeSessionState): void {
    const tab = getTab(tabId);
    if (tab && tab.claudeState !== state) upsertTab({ ...tab, claudeState: state });
    this.emit(tabId, { kind: ChatEventKind.State, state });
    // Fan out app-wide for the status dots. Prefer the live session's workspace,
    // falling back to the persisted tab so a transition with no session object
    // never broadcasts an empty id.
    const workspaceId = this.sessions.get(tabId)?.workspaceId ?? tab?.workspaceId;
    if (workspaceId)
      this.stateEvents.emit('change', { tabId, workspaceId, state } satisfies TabStateChange);
  }

  private emit(tabId: string, event: ChatEvent): void {
    this.events.emit(tabId, event);
  }
}

/** Shared singleton so the router and app lifecycle see the same sessions. */
export const claudeService = new ClaudeService();
