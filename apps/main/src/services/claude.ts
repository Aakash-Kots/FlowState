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
  PermissionBehavior,
  chatMessageSchema,
  type ChatBlock,
  type ChatEvent,
  type ChatMessage,
  type ChatSnapshot,
  type PermissionRequest,
  type Workspace,
} from '@flowstate/shared';
import {
  appendMessage,
  getSetting,
  getWorkspace,
  getWorkspaceTranscript,
  setSetting,
  upsertWorkspace,
} from '../store';
import { authService } from './auth';

///////////
// Types //
///////////

type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk');

type PendingPermission = {
  request: PermissionRequest;
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

const CWD_SETTING_KEY = 'claude.cwd';

const ASSISTANT_ERROR_TEXT: Record<string, string> = {
  authentication_failed:
    'Claude Code is not signed in. Open Connect and sign in with `claude auth login`.',
  billing_error: 'Claude Code reported a billing problem with your account.',
  rate_limit: 'Rate limited by the Claude API — wait a moment and try again.',
  overloaded: 'The Claude API is overloaded — try again shortly.',
};

/////////////
// Helpers //
/////////////

let sdkModule: Promise<SdkModule> | null = null;
function loadSdk(): Promise<SdkModule> {
  sdkModule ??= import('@anthropic-ai/claude-agent-sdk');
  return sdkModule;
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
  query: Query | null = null;
  sessionId: string | null = null;
  model: string | null = null;
  /** Set while an interrupt is in flight so error results read as a clean stop. */
  interrupted = false;

  constructor(
    readonly workspaceId: string,
    readonly cwd: string,
  ) {}
}

export class ClaudeService {
  private readonly sessions = new Map<string, ClaudeSession>();
  private readonly events = new EventEmitter();

  getCwd(): string | null {
    return getSetting<string>(CWD_SETTING_KEY);
  }

  /**
   * Point the workspace at a new folder. The old session (and its resume id)
   * is discarded — resuming a conversation under a different cwd is incoherent.
   */
  setCwd(workspaceId: string, cwd: string): void {
    setSetting(CWD_SETTING_KEY, cwd);
    this.disposeSession(workspaceId);
    const ws = getWorkspace(workspaceId);
    if (ws) upsertWorkspace({ ...ws, repoRoot: cwd, worktreePath: cwd, claudeSessionId: null });
    this.emit(workspaceId, { kind: ChatEventKind.Cwd, cwd });
  }

  send(workspaceId: string, text: string): void {
    const cwd = this.getCwd();
    if (!cwd) {
      this.emit(workspaceId, {
        kind: ChatEventKind.Error,
        message: 'Choose a working folder first.',
      });
      return;
    }
    if (!authService.status().claudeConnected) {
      this.emit(workspaceId, {
        kind: ChatEventKind.Error,
        message: 'Claude Code is not connected. Open Connect and sign in first.',
      });
      return;
    }

    const session = this.ensureSession(workspaceId, cwd);
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: ChatMessageRole.User,
      blocks: [{ type: ChatBlockType.Text, text }],
    };
    this.persistAndEmit(session, userMessage);
    this.setState(workspaceId, ClaudeSessionState.Running);
    session.queue.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
    });
  }

  async interrupt(workspaceId: string): Promise<void> {
    const session = this.sessions.get(workspaceId);
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
    this.setState(workspaceId, ClaudeSessionState.Idle);
  }

  respondPermission(
    workspaceId: string,
    requestId: string,
    behavior: PermissionBehavior,
    message?: string,
  ): void {
    const session = this.sessions.get(workspaceId);
    const pending = session?.pendingPermissions.get(requestId);
    if (!session || !pending) return;
    session.pendingPermissions.delete(requestId);
    pending.resolve(
      behavior === PermissionBehavior.Allow
        ? { behavior: 'allow' }
        : { behavior: 'deny', message: message ?? 'The user denied this action.' },
    );
    this.emit(workspaceId, { kind: ChatEventKind.PermissionResolved, id: requestId, behavior });
    if (session.pendingPermissions.size === 0)
      this.setState(workspaceId, ClaudeSessionState.Running);
  }

  onEvent(workspaceId: string, cb: (event: ChatEvent) => void): () => void {
    this.events.on(workspaceId, cb);
    return () => this.events.off(workspaceId, cb);
  }

  getSnapshot(workspaceId: string): ChatSnapshot {
    const ws = getWorkspace(workspaceId);
    const session = this.sessions.get(workspaceId);
    const messages: ChatSnapshot['messages'] = [];
    for (const row of getWorkspaceTranscript(workspaceId)) {
      // Rows persisted by older builds may not match the normalized shape — skip them.
      const parsed = chatMessageSchema.safeParse(row.content);
      if (parsed.success) messages.push({ message: parsed.data, createdAt: row.createdAt });
    }
    return {
      state: ws?.claudeState ?? ClaudeSessionState.Idle,
      sessionId: ws?.claudeSessionId ?? null,
      cwd: this.getCwd(),
      model: session?.model ?? null,
      messages,
      pendingPermissions: session
        ? [...session.pendingPermissions.values()].map((p) => p.request)
        : [],
    };
  }

  /** Tear down every session — called on app quit. */
  disposeAll(): void {
    for (const workspaceId of this.sessions.keys()) this.disposeSession(workspaceId);
  }

  private ensureSession(workspaceId: string, cwd: string): ClaudeSession {
    const existing = this.sessions.get(workspaceId);
    if (existing) return existing;

    const ws = this.ensureWorkspace(workspaceId, cwd);
    const session = new ClaudeSession(workspaceId, cwd);
    session.sessionId = ws.claudeSessionId;
    this.sessions.set(workspaceId, session);
    void this.run(session, ws.claudeSessionId);
    return session;
  }

  private ensureWorkspace(workspaceId: string, cwd: string): Workspace {
    const existing = getWorkspace(workspaceId);
    if (existing) return existing;
    return upsertWorkspace({
      id: workspaceId,
      name: 'Workspace',
      repoRoot: cwd,
      worktreePath: cwd,
      branch: '',
      linearIssue: null,
      claudeState: ClaudeSessionState.Idle,
      claudeSessionId: null,
      createdAt: new Date().toISOString(),
    });
  }

  private disposeSession(workspaceId: string): void {
    const session = this.sessions.get(workspaceId);
    if (!session) return;
    this.sessions.delete(workspaceId);
    this.resolveAllPermissions(session, {
      behavior: 'deny',
      message: 'The session was closed.',
      interrupt: true,
    });
    session.queue.end();
    session.abort.abort();
  }

  private async run(session: ClaudeSession, resumeSessionId: string | null): Promise<void> {
    const { workspaceId } = session;
    try {
      const sdk = await loadSdk();
      session.query = sdk.query({
        prompt: session.queue,
        options: {
          cwd: session.cwd,
          resume: resumeSessionId ?? undefined,
          permissionMode: 'default',
          canUseTool: this.makePermissionHandler(session),
          includePartialMessages: true,
          systemPrompt: { type: 'preset', preset: 'claude_code' },
          settingSources: ['user'],
          abortController: session.abort,
          stderr: (data) => console.warn('[claude:stderr]', data),
        },
      });

      for await (const message of session.query) {
        this.handleSdkMessage(session, message);
      }
      // Stream ended cleanly (queue ended / abort). Nothing more to do.
    } catch (err) {
      if (!this.sessions.has(workspaceId)) return; // torn down deliberately
      const text = err instanceof Error ? err.message : String(err);
      console.error('[claude] session crashed:', text);
      this.emit(workspaceId, {
        kind: ChatEventKind.Error,
        message: `Claude session error: ${text}`,
      });
      this.setState(workspaceId, ClaudeSessionState.Error);
      // Drop the broken session; the next send() starts fresh and resumes.
      this.sessions.delete(workspaceId);
      this.resolveAllPermissions(session, {
        behavior: 'deny',
        message: 'The session ended.',
        interrupt: true,
      });
      session.queue.end();
    }
  }

  private handleSdkMessage(session: ClaudeSession, message: SDKMessage): void {
    const { workspaceId } = session;
    switch (message.type) {
      case 'system': {
        if (message.subtype === 'init') {
          session.sessionId = message.session_id;
          session.model = message.model;
          const ws = getWorkspace(workspaceId);
          if (ws) upsertWorkspace({ ...ws, claudeSessionId: message.session_id });
          this.emit(workspaceId, {
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
          this.setState(workspaceId, state);
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
            this.emit(workspaceId, { kind: ChatEventKind.TextDelta, text: event.delta.text });
          }
        } else if (event.type === 'content_block_start' && event.content_block?.type) {
          this.emit(workspaceId, {
            kind: ChatEventKind.BlockStart,
            blockType: event.content_block.type,
          });
        }
        break;
      }

      case 'assistant': {
        if (message.parent_tool_use_id !== null) break; // subagent messages
        if (message.error) {
          this.emit(workspaceId, {
            kind: ChatEventKind.Error,
            message:
              ASSISTANT_ERROR_TEXT[message.error] ?? `Claude returned an error: ${message.error}`,
          });
          this.setState(workspaceId, ClaudeSessionState.Error);
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
        this.persistAndEmit(session, {
          id: message.uuid,
          role: ChatMessageRole.Result,
          blocks,
          meta: {
            costUsd: message.total_cost_usd,
            durationMs: message.duration_ms,
            numTurns: message.num_turns,
            isError,
          },
        });
        session.interrupted = false;
        this.setState(workspaceId, ClaudeSessionState.Idle);
        break;
      }

      default:
        break; // the SDKMessage union is huge — ignore everything else
    }
  }

  private makePermissionHandler(session: ClaudeSession): CanUseTool {
    return (toolName, input, options) =>
      new Promise<PermissionResult>((resolve) => {
        const request: PermissionRequest = {
          id: randomUUID(),
          toolName,
          input,
          title: options.title,
          description: options.description,
        };
        session.pendingPermissions.set(request.id, { request, resolve });
        this.setState(session.workspaceId, ClaudeSessionState.Waiting);
        this.emit(session.workspaceId, { kind: ChatEventKind.PermissionRequest, ...request });

        options.signal.addEventListener('abort', () => {
          if (!session.pendingPermissions.delete(request.id)) return;
          this.emit(session.workspaceId, {
            kind: ChatEventKind.PermissionResolved,
            id: request.id,
            behavior: PermissionBehavior.Deny,
          });
          resolve({ behavior: 'deny', message: 'The request was cancelled.' });
        });
      });
  }

  private resolveAllPermissions(session: ClaudeSession, result: PermissionResult): void {
    for (const [id, pending] of session.pendingPermissions) {
      pending.resolve(result);
      this.emit(session.workspaceId, {
        kind: ChatEventKind.PermissionResolved,
        id,
        behavior: result.behavior === 'allow' ? PermissionBehavior.Allow : PermissionBehavior.Deny,
      });
    }
    session.pendingPermissions.clear();
  }

  private persistAndEmit(session: ClaudeSession, message: ChatMessage): void {
    const createdAt = new Date().toISOString();
    appendMessage(session.workspaceId, session.sessionId ?? 'pending', {
      role: message.role,
      content: message,
      createdAt,
    });
    this.emit(session.workspaceId, { kind: ChatEventKind.Message, message, createdAt });
  }

  private setState(workspaceId: string, state: ClaudeSessionState): void {
    const ws = getWorkspace(workspaceId);
    if (ws && ws.claudeState !== state) upsertWorkspace({ ...ws, claudeState: state });
    this.emit(workspaceId, { kind: ChatEventKind.State, state });
  }

  private emit(workspaceId: string, event: ChatEvent): void {
    this.events.emit(workspaceId, event);
  }
}

/** Shared singleton so the router and app lifecycle see the same sessions. */
export const claudeService = new ClaudeService();
