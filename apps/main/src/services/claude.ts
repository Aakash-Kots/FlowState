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
import { readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import type {
  CanUseTool,
  ModelInfo,
  PermissionMode as SdkPermissionMode,
  PermissionResult,
  Query,
  SDKControlGetUsageResponse,
  SDKMessage,
  SDKRateLimitInfo,
  SDKUserMessage,
  SlashCommand,
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
  resolveModelOptions,
  type ChatBlock,
  type ChatEvent,
  type ChatHistoryPage,
  type ChatImageInput,
  type ChatMessage,
  type ChatSnapshot,
  type ChatSnapshotEntry,
  type ModelOption,
  type PermissionRequest,
  type QuestionItem,
  type QuestionRequest,
  type SkillOption,
  type Tab,
  type TabStateChange,
  type TurnFileChange,
  type UsageLimits,
  type UsageModelWindow,
  type UsageWindowBreakdown,
} from '@flowstate/shared';
import {
  appendMessage,
  deleteTabTranscript,
  getRecentTabChatRows,
  getTab,
  getTabChatRowsBefore,
  getTabTranscript,
  getWorkspace,
  listAllTabs,
  listTabs,
  recordUsageEvent,
  upsertTab,
  upsertWorkspace,
  type TabChatPage,
} from '../store';
import { SdkSystemSubtype } from '../lib/enums/claude';
import { authService } from './auth';
import { GitService } from './git';
import { renameWorktree } from './worktreeEvents';

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

/**
 * How many recent transcript entries a tab hydrates with, and how many older
 * entries each scroll-back page loads. Bounding the initial load keeps opening a
 * long-running tab cheap (one full-transcript read + validate used to run on
 * every open); older history pages in on demand.
 */
const SNAPSHOT_MESSAGE_LIMIT = 200;
const HISTORY_PAGE_SIZE = 100;

/** Coalesce streamed `text_delta` tokens into one IPC emit per this window (ms). */
const TEXT_FLUSH_MS = 33;

/**
 * Signatures of a crash where the SDK's native `claude` runtime never launched
 * (missing binary / unresolved module), as opposed to a transient mid-stream
 * drop. Matched against the raw error text to decide whether to surface a banner.
 */
const RUNTIME_LAUNCH_FAILURE = /Native CLI binary|Cannot find module|claude-agent-sdk|ENOENT/;
const RUNTIME_LAUNCH_FAILURE_TEXT =
  "Claude Code's runtime failed to launch — this is likely a packaging bug. Try reinstalling FlowState.";

const ASSISTANT_ERROR_TEXT: Record<string, string> = {
  authentication_failed:
    'Claude Code is not signed in. Open Connect and sign in with `claude auth login`.',
  billing_error: 'Claude Code reported a billing problem with your account.',
  rate_limit: 'Rate limited by the Claude API — wait a moment and try again.',
  overloaded: 'The Claude API is overloaded — try again shortly.',
};

/**
 * Re-poll the full subscription-usage snapshot every N finalized turns. The
 * passive `rate_limit_event` push keeps the session/weekly meters fresh between
 * polls; this refreshes everything (incl. per-model windows) without hammering
 * the SDK on every turn.
 */
const USAGE_POLL_EVERY_TURNS = 5;

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
 * Absolute path to the native `claude` runtime the SDK forks, or undefined to let
 * the SDK resolve it from node_modules (dev). In a packaged app the SDK can't
 * resolve its per-platform binary out of Bun's symlink store, so we ship it as an
 * extraResource (`Resources/claude-code/claude[.exe]`) and point the SDK straight
 * at it. The binary carries a `.exe` suffix on Windows (see electron-builder.yml).
 */
function claudeExecutable(): string | undefined {
  if (!app.isPackaged) return undefined;
  const bin = process.platform === 'win32' ? 'claude.exe' : 'claude';
  return join(process.resourcesPath, 'claude-code', bin);
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
        pathToClaudeCodeExecutable: claudeExecutable(),
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

function normalizeAssistantBlocks(content: unknown, parentToolUseId: string | null): ChatBlock[] {
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
          // Tag a subagent's call with its parent Task id so the renderer nests it.
          ...(parentToolUseId ? { parentToolUseId } : {}),
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
 * Normalize the SDK's `/usage` response into the trimmed `UsageLimits` the widget
 * renders: 5-hour → session, 7-day (all models) → weekly, the per-model weekly
 * windows (Fable etc.) → models[], and the local-transcript contribution scan →
 * breakdown (the hover "where usage is going"). When plan limits don't apply
 * (API key / third-party), the windows come back null and the widget hides.
 */
function toUsageLimits(raw: SDKControlGetUsageResponse): UsageLimits {
  const limits = raw.rate_limits;
  const toWindow = (w: { utilization: number | null; resets_at: string | null } | null) =>
    w ? { utilization: w.utilization, resetsAt: w.resets_at } : null;
  const models: UsageModelWindow[] = (limits?.model_scoped ?? []).map((m) => ({
    displayName: m.display_name,
    utilization: m.utilization,
    resetsAt: m.resets_at,
  }));

  const toBreakdown = (
    w: NonNullable<SDKControlGetUsageResponse['behaviors']>['day'],
  ): UsageWindowBreakdown => ({
    requestCount: w.request_count,
    sessionCount: w.session_count,
    behaviors: w.behaviors.map((x) => ({ key: x.key, pct: x.pct, count: x.count })),
    skills: w.skills.map((x) => ({ name: x.name, pct: x.pct })),
    subagents: w.agents.map((x) => ({ name: x.name, pct: x.pct })),
    mcpServers: w.mcp_servers.map((x) => ({ name: x.name, pct: x.pct })),
  });
  const b = raw.behaviors;

  return {
    subscriptionType: raw.subscription_type,
    session: toWindow(limits?.five_hour ?? null),
    weekly: toWindow(limits?.seven_day ?? null),
    models,
    breakdown: b ? { day: toBreakdown(b.day), week: toBreakdown(b.week) } : null,
  };
}

/** Map an SDK `SlashCommand` (a skill) to our `SkillOption`. */
function toSkillOption(cmd: SlashCommand): SkillOption {
  return {
    name: cmd.name,
    description: cmd.description,
    argumentHint: cmd.argumentHint,
    ...(cmd.aliases ? { aliases: cmd.aliases } : {}),
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
  /**
   * Skills (SDK slash commands) available to this session — captured at init and
   * replaced wholesale on the SDK's `commands_changed` push. Empty until the
   * session initializes.
   */
  skills: SkillOption[] = [];
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
  /**
   * Coalesced streaming text: the SDK pushes a `text_delta` per token, but
   * emitting one IPC message each is wasteful. Deltas accumulate here and flush
   * as a single `TextDelta` on a short timer (or immediately before any other
   * event, to preserve ordering).
   */
  textBuffer = '';
  textFlush: ReturnType<typeof setTimeout> | null = null;

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
  // App-wide fan-out of subscription-usage snapshots for the header widget
  // (account-global, not tab-scoped). Emits on each poll and each rate-limit push.
  private readonly usageEvents = new EventEmitter();
  /** Last usage snapshot, or null before the first successful poll. */
  private latestUsageLimits: UsageLimits | null = null;
  /** Turns since the last full usage poll — see `USAGE_POLL_EVERY_TURNS`. */
  private turnsSinceUsagePoll = 0;
  /** Guards the one-shot background session booted purely to fetch usage. */
  private usageBootStarted = false;

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
  send(tabId: string, text: string, images?: ChatImageInput[]): void {
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
    const trimmed = text.trim();
    const imageList = images ?? [];
    // Persisted/rendered form: image blocks first (they lead the bubble), then
    // the text block when there's any text.
    const blocks: ChatBlock[] = imageList.map((img) => ({
      type: ChatBlockType.Image,
      mediaType: img.mediaType,
      data: img.data,
      name: img.name,
    }));
    if (trimmed) blocks.push({ type: ChatBlockType.Text, text: trimmed });
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: ChatMessageRole.User,
      blocks,
    };
    this.persistAndEmit(session, userMessage);
    this.setState(tabId, ClaudeSessionState.Running);
    // Snapshot the worktree now (before the agent's first edit) so the turn's
    // `result` can report exactly which files this run changed. Best-effort.
    session.turnBaseline = new GitService(cwd).snapshotTree().catch(() => null);
    // Hand the SDK a content-block array when images are attached (text stays a
    // plain string otherwise). Base64 images map straight to the SDK's
    // `Base64ImageSource`; the text block trails so the model reads it last.
    const content: SDKUserMessage['message']['content'] = imageList.length
      ? [
          ...imageList.map((img) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
          })),
          ...(trimmed ? [{ type: 'text' as const, text: trimmed }] : []),
        ]
      : trimmed;
    session.queue.push({
      type: 'user',
      message: { role: 'user', content },
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
   * Clear a tab's chat — Claude Code's `/clear`. Tears down the live session
   * (aborting any in-flight turn), wipes the persisted transcript, and forgets
   * the resume id so the next send() starts a brand-new session. The tab's
   * model / effort / permission-mode selections are kept (they live on the tab
   * record and the renderer store, neither of which this touches); the usage
   * ledger is separate durable accounting and is likewise preserved.
   */
  clear(tabId: string): void {
    const tab = getTab(tabId);
    // Aborts the in-flight turn, denies any parked prompts, ends the queue, and
    // drops the session — its abort makes run()'s catch early-return silently.
    this.disposeSession(tabId);
    deleteTabTranscript(tabId);
    if (tab) upsertTab({ ...tab, claudeSessionId: null, claudeState: ClaudeSessionState.Idle });
    // The authoritative reset for live subscribers, emitted after the session is
    // gone so it's the last event on the tab's channel (supersedes any events
    // flushed during the abort).
    this.emit(tabId, { kind: ChatEventKind.Cleared });
    // disposeSession emits no state, so fan out Idle directly for the tab-strip /
    // sidebar status dots (skipping setState avoids a redundant per-tab State event).
    if (tab)
      this.stateEvents.emit('change', {
        tabId,
        workspaceId: tab.workspaceId,
        state: ClaudeSessionState.Idle,
      } satisfies TabStateChange);
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
   * Models offered to a tab's picker: the live list the SDK reports for this
   * session (what the plan actually grants), falling back to the curated set only
   * when the SDK reports nothing. Boots a no-prompt session when none exists (like
   * `getSupportedSkills`) so the real list is available before the first message.
   */
  async getSupportedModels(tabId: string): Promise<ModelOption[]> {
    let session = this.sessions.get(tabId);
    if (!session) {
      const tab = getTab(tabId);
      const cwd = tab ? this.getCwd(tab.workspaceId) : null;
      if (!tab || !cwd || !authService.status().claudeConnected) return resolveModelOptions([]);
      session = this.ensureSession(tab, cwd);
    }
    try {
      const infos = await session.query?.supportedModels();
      return resolveModelOptions((infos ?? []).map(toModelOption));
    } catch (err) {
      console.warn('[claude] supportedModels failed', err);
      return resolveModelOptions([]);
    }
  }

  /**
   * Skills (SDK slash commands) a tab can invoke — the cache populated at the
   * session's init and on the SDK's `commands_changed` push. Empty until a
   * session exists (started by the first `send`); the renderer also gets live
   * updates via the `SkillsUpdated` ChatEvent.
   */
  async getSupportedSkills(tabId: string): Promise<SkillOption[]> {
    let session = this.sessions.get(tabId);
    // Boot the session (no prompt) so skills can be discovered before the first
    // message — the SDK initializes, then `commands_changed`/init populate the
    // cache and the renderer gets a live SkillsUpdated event. Only worthwhile
    // once the tab has a folder and Claude is connected.
    if (!session) {
      const tab = getTab(tabId);
      const cwd = tab ? this.getCwd(tab.workspaceId) : null;
      if (!tab || !cwd || !authService.status().claudeConnected) return [];
      session = this.ensureSession(tab, cwd);
    }
    if (session.skills.length > 0) return session.skills;
    try {
      // `query` may still be spinning up (run() awaits the dynamic SDK import);
      // in that case init's refreshSkills delivers the list via SkillsUpdated.
      const cmds = await session.query?.supportedCommands();
      session.skills = (cmds ?? []).map(toSkillOption);
      return session.skills;
    } catch (err) {
      console.warn('[claude] supportedCommands failed', err);
      return [];
    }
  }

  /**
   * Force a re-fetch of a tab's skills from the SDK and broadcast them — used
   * after a skill file is imported into the worktree so a newly-added skill can
   * surface without waiting for the next `commands_changed` push. Best-effort
   * and a no-op when the tab has no live session (the skill is then discovered
   * on the next session boot regardless).
   */
  async refreshSkillsForTab(tabId: string): Promise<void> {
    const session = this.sessions.get(tabId);
    if (session) await this.refreshSkills(session);
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

  /**
   * The latest subscription-usage snapshot for the header widget. Null until the
   * first poll lands. When nothing is cached yet: poll immediately if a session
   * is already live, else boot a background session so the widget can populate
   * before the user opens a chat. Either way the `onUsageLimits` subscriber sees
   * the result shortly.
   */
  getUsageLimits(): UsageLimits | null {
    if (!this.latestUsageLimits) {
      if (this.anyLiveQuery()) void this.pollUsageLimits();
      else this.bootSessionForUsage();
    }
    return this.latestUsageLimits;
  }

  /** Subscribe to usage-snapshot updates; returns an unsubscribe function. */
  onUsageLimits(cb: (limits: UsageLimits) => void): () => void {
    this.usageEvents.on('usage', cb);
    return () => this.usageEvents.off('usage', cb);
  }

  /**
   * Poll the SDK's structured `/usage` data from any live session (limits are
   * account-global, so any session returns the same numbers), cache it, and fan
   * it out. Best-effort: the SDK method is EXPERIMENTAL, so any throw keeps the
   * last snapshot rather than surfacing an error.
   */
  private async pollUsageLimits(): Promise<void> {
    const query = this.anyLiveQuery();
    if (!query) return;
    try {
      const raw = await query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET();
      this.latestUsageLimits = toUsageLimits(raw);
      console.log('[claude] usage polled', {
        subscriptionType: raw.subscription_type,
        rateLimitsAvailable: raw.rate_limits_available,
      });
      this.usageEvents.emit('usage', this.latestUsageLimits);
    } catch (err) {
      console.warn('[claude] usage poll failed', err);
    }
  }

  /** Any session with a live SDK `query`, or null if none is running. */
  private anyLiveQuery(): Query | null {
    for (const session of this.sessions.values()) {
      if (session.query) return session.query;
    }
    return null;
  }

  /**
   * When no session is running yet, boot one no-prompt background session so the
   * usage widget can populate before the user opens a chat. Gated: needs Claude
   * connected and a tab whose workspace has a worktree folder; runs at most once
   * per app run. The booted session's `init` message fires `pollUsageLimits()`.
   */
  private bootSessionForUsage(): void {
    if (this.usageBootStarted || this.anyLiveQuery()) return;
    if (!authService.status().claudeConnected) return;
    for (const tab of listAllTabs()) {
      const cwd = this.getCwd(tab.workspaceId);
      if (!cwd) continue;
      this.usageBootStarted = true;
      this.ensureSession(tab, cwd);
      // Don't rely only on the session's `init` message to fire the first poll —
      // poll directly once its query is live (the control channel answers before
      // any prompt, same as `supportedCommands`).
      void this.pollUsageWhenReady();
      return;
    }
  }

  /**
   * Poll once a live query appears (a freshly booted session's `query` is set
   * asynchronously). Polls at most once; gives up quietly after ~10s.
   */
  private async pollUsageWhenReady(): Promise<void> {
    for (let i = 0; i < 20; i++) {
      if (this.latestUsageLimits) return; // init already polled — done
      if (this.anyLiveQuery()) {
        await this.pollUsageLimits();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Patch the cached snapshot from a `rate_limit_event` push. Only the two
   * account-wide windows (5-hour → session, 7-day → weekly) map cleanly; the
   * push has no Fable-specific key, so per-model windows wait for the next poll.
   * Skips entirely until a full poll has seeded the snapshot.
   */
  private applyRateLimitPush(info: SDKRateLimitInfo): void {
    const snapshot = this.latestUsageLimits;
    if (!snapshot || info.utilization === undefined) return;
    const resetsAt =
      info.resetsAt === undefined
        ? null
        : new Date(info.resetsAt < 1e12 ? info.resetsAt * 1000 : info.resetsAt).toISOString();
    const window = { utilization: info.utilization, resetsAt };
    let patched: UsageLimits | null = null;
    if (info.rateLimitType === 'five_hour') patched = { ...snapshot, session: window };
    else if (info.rateLimitType === 'seven_day') patched = { ...snapshot, weekly: window };
    if (!patched) return;
    this.latestUsageLimits = patched;
    this.usageEvents.emit('usage', patched);
  }

  /** Hydrate a tab on mount: persisted state, resume id, cwd, and recent transcript. */
  getSnapshot(tabId: string): ChatSnapshot {
    const tab = getTab(tabId);
    const session = this.sessions.get(tabId);
    const page = getRecentTabChatRows(tabId, SNAPSHOT_MESSAGE_LIMIT);
    const { messages, oldestId } = this.validatePage(page);
    return {
      state: tab?.claudeState ?? ClaudeSessionState.Idle,
      sessionId: tab?.claudeSessionId ?? null,
      cwd: tab ? this.getCwd(tab.workspaceId) : null,
      // Prefer the explicit selection; fall back to what the last turn ran as.
      model: session ? (session.model ?? session.reportedModel) : (tab?.model ?? null),
      effort: session?.effort ?? tab?.effort ?? null,
      permissionMode: session?.permissionMode ?? tab?.permissionMode ?? PermissionMode.Default,
      messages,
      oldestId,
      hasMoreBefore: page.hasMoreBefore,
      pendingPermissions: session
        ? [...session.pendingPermissions.values()].map((p) => p.request)
        : [],
      pendingQuestions: session ? [...session.pendingQuestions.values()].map((p) => p.request) : [],
      skills: session?.skills ?? [],
    };
  }

  /** Load a page of older transcript entries before `beforeId`, for scroll-back paging. */
  loadOlderMessages(tabId: string, beforeId: number): ChatHistoryPage {
    const page = getTabChatRowsBefore(tabId, beforeId, HISTORY_PAGE_SIZE);
    const { messages, oldestId } = this.validatePage(page);
    return { messages, oldestId, hasMoreBefore: page.hasMoreBefore };
  }

  /**
   * Validate a lean transcript page into snapshot entries in a single zod pass.
   * The cursor (`oldestId`) is the oldest *raw* row's id so it always advances,
   * even if that row failed validation (older builds may not match the shape).
   */
  private validatePage(page: TabChatPage): { messages: ChatSnapshotEntry[]; oldestId: number | null } {
    const messages: ChatSnapshotEntry[] = [];
    for (const row of page.rows) {
      const parsed = chatMessageSchema.safeParse(row.content);
      if (parsed.success) messages.push({ message: parsed.data, createdAt: row.createdAt });
    }
    return { messages, oldestId: page.rows[0]?.id ?? null };
  }

  /** Fetch and cache the session's skills, then broadcast them to the renderer. */
  private async refreshSkills(session: ClaudeSession): Promise<void> {
    try {
      const cmds = await session.query?.supportedCommands();
      session.skills = (cmds ?? []).map(toSkillOption);
      this.emit(session.tabId, { kind: ChatEventKind.SkillsUpdated, skills: session.skills });
    } catch (err) {
      console.warn('[claude] supportedCommands failed', err);
    }
  }

  /** Tear down a single tab's session — called when a tab is closed. */
  closeSession(tabId: string): void {
    this.disposeSession(tabId);
  }

  /** Tear down every session — called on app quit. */
  disposeAll(): void {
    for (const tabId of this.sessions.keys()) this.disposeSession(tabId);
  }

  /**
   * Remove the Claude Agent SDK's on-disk transcript directory for a worktree.
   * The SDK keys transcripts by cwd at `<configDir>/projects/<sanitized-cwd>/`,
   * replacing every non-alphanumeric char with '-' (truncating to 200 chars +
   * appending a hash for longer paths). One `.jsonl` per session id accumulates
   * there, so removing the whole per-cwd dir is the complete cleanup. Called on
   * worktree teardown; the DB rows are dropped separately via cascade.
   *
   * Best-effort + non-fatal: worktree deletion must never fail because a stale
   * transcript dir couldn't be removed. Mirrors the SDK's own path logic
   * (@anthropic-ai/claude-agent-sdk) — revisit on SDK upgrades.
   */
  async removeTranscriptDir(cwd: string): Promise<void> {
    try {
      const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
      const projects = join(configDir, 'projects');
      const sanitized = cwd.replace(/[^a-zA-Z0-9]/g, '-');
      if (sanitized.length <= 200) {
        await rm(join(projects, sanitized), { recursive: true, force: true });
        return;
      }
      // Long path: the SDK appends "-<hash>" we can't reproduce, so prefix-match.
      const prefix = `${sanitized.slice(0, 200)}-`;
      for (const entry of await readdir(projects)) {
        if (entry.startsWith(prefix)) {
          await rm(join(projects, entry), { recursive: true, force: true });
        }
      }
    } catch (error) {
      console.warn('[claude] failed to remove transcript dir', cwd, error);
    }
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
    if (session.textFlush) clearTimeout(session.textFlush);
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
          pathToClaudeCodeExecutable: claudeExecutable(),
          canUseTool: this.makePermissionHandler(session),
          includePartialMessages: true,
          systemPrompt: { type: 'preset', preset: 'claude_code' },
          // Load user + project config so the repo's `.claude/skills` and
          // CLAUDE.md are discovered; `skills: 'all'` makes every discovered
          // skill available to invoke from the composer's `/` menu.
          settingSources: ['user', 'project'],
          skills: 'all',
          abortController: session.abort,
          stderr: (data) => console.warn('[claude:stderr]', data),
        },
      });

      // Fetch the session's skills as soon as the query exists (supportedCommands
      // resolves once the SDK finishes initializing) so the composer's `/` menu
      // works before the first prompt — not only after an init message.
      void this.refreshSkills(session);

      for await (const message of session.query) {
        await this.handleSdkMessage(session, message);
      }
      // Stream ended cleanly (queue ended / abort). Nothing more to do.
    } catch (err) {
      if (!this.sessions.has(tabId)) return; // torn down deliberately
      const text = err instanceof Error ? err.message : String(err);
      // A raw stream crash carries nothing the user can act on — log it for
      // debugging and reset the tab quietly to Idle (no banner, no red pill).
      // The next send() starts a fresh session and resumes the transcript.
      console.error('[claude] session crashed:', text);
      // Exception: if the native runtime never launched (packaging bug), a silent
      // reset just shows "Ready" forever — surface an actionable banner instead.
      if (RUNTIME_LAUNCH_FAILURE.test(text)) {
        this.emit(tabId, { kind: ChatEventKind.Error, message: RUNTIME_LAUNCH_FAILURE_TEXT });
        this.setState(tabId, ClaudeSessionState.Error);
      } else {
        this.setState(tabId, ClaudeSessionState.Idle);
      }
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
        if (message.subtype === SdkSystemSubtype.Init) {
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
          // Populate the usage widget as soon as a session opens (before turn 5).
          void this.pollUsageLimits();
        } else if (message.subtype === SdkSystemSubtype.CommandsChanged) {
          // The SDK discovered/dropped skills mid-session — replace the cache.
          session.skills = (message.commands as SlashCommand[]).map(toSkillOption);
          this.emit(tabId, { kind: ChatEventKind.SkillsUpdated, skills: session.skills });
        } else if (message.subtype === SdkSystemSubtype.SessionStateChanged) {
          const state: ClaudeSessionState =
            message.state === 'requires_action'
              ? ClaudeSessionState.Waiting
              : message.state === 'running'
                ? ClaudeSessionState.Running
                : ClaudeSessionState.Idle;
          this.setState(tabId, state);
        } else if (message.subtype === SdkSystemSubtype.ApiRetry) {
          this.emit(tabId, {
            kind: ChatEventKind.ApiRetry,
            attempt: message.attempt,
            maxRetries: message.max_retries,
          });
        }
        break;
      }

      case 'tool_progress': {
        if (message.parent_tool_use_id !== null) break; // subagent-internal tool
        this.emit(tabId, {
          kind: ChatEventKind.ToolProgress,
          toolName: message.tool_name,
          elapsedSeconds: message.elapsed_time_seconds,
        });
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
          if (event.delta.text) this.bufferText(session, event.delta.text);
        } else if (event.type === 'content_block_start' && event.content_block?.type) {
          this.emit(tabId, {
            kind: ChatEventKind.BlockStart,
            blockType: event.content_block.type,
            // Present only for tool_use blocks; drives the named activity indicator.
            toolName: event.content_block.name,
          });
        }
        break;
      }

      case 'assistant': {
        // A subagent's messages carry a parent Task id. By default the SDK sends
        // only their tool_use blocks (no prose) — normalize and persist them
        // tagged with the parent id so the renderer nests them under the Task row.
        if (message.parent_tool_use_id !== null) {
          const blocks = normalizeAssistantBlocks(
            message.message.content,
            message.parent_tool_use_id,
          );
          if (blocks.length === 0) break;
          this.persistAndEmit(session, {
            id: message.uuid,
            role: ChatMessageRole.Assistant,
            blocks,
          });
          break;
        }
        if (message.error) {
          // Only surface errors we have a curated, actionable message for
          // (auth / billing / rate-limit / overloaded). Anything else is opaque
          // to the user — log it and reset quietly rather than alarm them.
          const curated = ASSISTANT_ERROR_TEXT[message.error];
          if (curated) {
            this.emit(tabId, { kind: ChatEventKind.Error, message: curated });
            this.setState(tabId, ClaudeSessionState.Error);
          } else {
            console.warn('[claude] assistant error', message.error);
            this.setState(tabId, ClaudeSessionState.Idle);
          }
          break;
        }
        const blocks = normalizeAssistantBlocks(message.message.content, null);
        if (blocks.length === 0) break;
        this.persistAndEmit(session, { id: message.uuid, role: ChatMessageRole.Assistant, blocks });
        break;
      }

      case 'user': {
        // Only tool results are interesting here — the user's own prompts are
        // persisted in send(), and replayed history would duplicate them. This
        // includes subagent tool results (parent_tool_use_id set): they carry
        // tool_result blocks keyed by their call id, which nest under the Task row.
        const blocks = normalizeToolResultBlocks(message.message.content);
        if (blocks.length === 0) break;
        const id = 'uuid' in message && message.uuid ? String(message.uuid) : randomUUID();
        this.persistAndEmit(session, { id, role: ChatMessageRole.Tool, blocks });
        break;
      }

      case 'result': {
        const isError = message.subtype !== 'success' && !session.interrupted;
        // A failed run's error text is internal and unactionable — keep it out of
        // the transcript (the footer still shows timing/turns/file-changes) and
        // log it for debugging instead. The usage ledger below still records the
        // failure via `isError`.
        if (isError) console.warn('[claude] run failed', message.subtype, message.errors);
        const blocks: ChatBlock[] = [];
        const fileChanges = await this.turnFileChanges(session);
        // Record the turn's API-equivalent cost + token usage in the durable
        // ledger (for the spend/savings analyser). Token counts live only here,
        // never in the transcript meta below.
        const usage = message.usage;
        recordUsageEvent({
          workspaceId: session.workspaceId,
          tabId: session.tabId,
          sessionId: session.sessionId ?? 'pending',
          model: session.reportedModel ?? session.model,
          costUsd: message.total_cost_usd,
          durationMs: message.duration_ms,
          numTurns: message.num_turns,
          inputTokens: usage?.input_tokens ?? null,
          outputTokens: usage?.output_tokens ?? null,
          cacheReadTokens: usage?.cache_read_input_tokens ?? null,
          cacheCreationTokens: usage?.cache_creation_input_tokens ?? null,
          isError,
          createdAt: new Date().toISOString(),
        });
        // The transcript keeps only what the UI still renders (duration · turns);
        // cost is intentionally omitted — it lives in the ledger above.
        this.persistAndEmit(session, {
          id: message.uuid,
          role: ChatMessageRole.Result,
          blocks,
          meta: {
            durationMs: message.duration_ms,
            numTurns: message.num_turns,
            isError,
            ...(fileChanges ? { fileChanges } : {}),
          },
        });
        session.interrupted = false;
        this.setState(tabId, ClaudeSessionState.Idle);
        // Re-poll the full usage snapshot every Nth finalized turn (the passive
        // rate_limit_event push keeps meters fresh in between).
        if (++this.turnsSinceUsagePoll >= USAGE_POLL_EVERY_TURNS) {
          this.turnsSinceUsagePoll = 0;
          void this.pollUsageLimits();
        }
        // Auto-title the tab from its opening exchange (fire-and-forget, once).
        if (message.subtype === 'success') void this.maybeGenerateTitle(session);
        break;
      }

      case 'rate_limit_event': {
        // A cheap live nudge between full polls: patch the matching window's
        // utilization/reset in place. Per-model (Fable) windows aren't keyed here
        // — those refresh on the next full poll.
        this.applyRateLimitPush(message.rate_limit_info);
        break;
      }

      default:
        break; // the SDKMessage union is huge — ignore everything else
    }
  }

  private makePermissionHandler(session: ClaudeSession): CanUseTool {
    return (toolName, input, options) => {
      // AskUserQuestion is a genuine question to the user, not a permission —
      // always surface it, even in Auto-accept.
      if (toolName === ASK_USER_QUESTION_TOOL) {
        return this.handleQuestion(session, input, options.signal);
      }
      // Auto-accept: the SDK only truly bypasses when `bypassPermissions` is
      // paired with `allowDangerouslySkipPermissions` at query() construction,
      // which we can't set on a live Shift+Tab switch — so honor the mode here
      // by allowing every tool outright instead of parking a prompt.
      if (session.permissionMode === PermissionMode.BypassPermissions) {
        return Promise.resolve({ behavior: 'allow' });
      }
      return this.handlePermission(session, toolName, input, options);
    };
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
      // title and broadcast — shared with the manual sidebar rename via
      // `renameWorktree`, so both reach every view (not just this tab). The
      // Linear-linked guard and best-effort git handling live in that helper.
      await renameWorktree(workspace.id, name);
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
    // Any non-text event must land after the streamed text that preceded it —
    // flush the pending TextDelta buffer first so ordering is preserved.
    if (event.kind !== ChatEventKind.TextDelta) {
      const session = this.sessions.get(tabId);
      if (session) this.flushText(session);
    }
    this.events.emit(tabId, event);
  }

  /** Accumulate a streamed text delta and schedule a coalesced flush. */
  private bufferText(session: ClaudeSession, text: string): void {
    session.textBuffer += text;
    if (session.textFlush) return;
    session.textFlush = setTimeout(() => this.flushText(session), TEXT_FLUSH_MS);
  }

  /** Emit any buffered streaming text as a single `TextDelta` and clear the timer. */
  private flushText(session: ClaudeSession): void {
    if (session.textFlush) {
      clearTimeout(session.textFlush);
      session.textFlush = null;
    }
    if (!session.textBuffer) return;
    const text = session.textBuffer;
    session.textBuffer = '';
    // Emit directly (not via `emit`) — this IS the text flush, so it must not recurse.
    this.events.emit(session.tabId, { kind: ChatEventKind.TextDelta, text });
  }
}

/** Shared singleton so the router and app lifecycle see the same sessions. */
export const claudeService = new ClaudeService();
