/**
 * GemmaService — runs a generative Gemma 3 model on-device via node-llama-cpp,
 * powering the "Ask Gemma" palette (double-tap Space). Mirrors the embedding
 * service's shape: memoized ESM dynamic import, hardware-picked tier (1B/4B/12B
 * by RAM), one-time GGUF download into userData/models with progress, and a
 * process-wide singleton that streams tokens back to the renderer.
 *
 * Generation is one-shot and stateless — each ask runs on a fresh chat session
 * (no carried history) and calls are serialized onto the single context so they
 * never interleave.
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { totalmem } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import {
  LocalModelState,
  type GemmaToolCall,
  type GemmaToolResult,
  type ModelDiskInfo,
  type ModelStatus,
  type RespondGemmaToolInput,
} from '@flowstate/shared';
import { LOCAL_MODELS, selectGenerativeSpec } from '../lib/constants/local-model';
import { LocalModelKind } from '../lib/enums/local-model';
import type { HardwareProfile, ModelSpec, QuantSource } from '../lib/types/local-model';
import type { ToolContext } from '../lib/types/local-tools';
import { getGemmaTierPreference } from '../store/settings';
import { buildToolFunctions, type ToolDecision } from './gemmaTools';

///////////
// Types //
///////////

type Lib = typeof import('node-llama-cpp');
type Llama = Awaited<ReturnType<Lib['getLlama']>>;
type LlamaModel = Awaited<ReturnType<Llama['loadModel']>>;
type ChatContext = Awaited<ReturnType<LlamaModel['createContext']>>;

/** Callbacks the router passes into `generate` to stream a reply plus its tool
 * round-trips back to the palette. */
type GenerateHandlers = {
  onToken: (text: string) => void;
  onToolCall: (call: GemmaToolCall) => void;
  onToolResult: (result: GemmaToolResult) => void;
};

/** A gated tool call awaiting the renderer's approve/deny answer. */
type PendingTool = {
  resolve: (decision: ToolDecision) => void;
};

///////////////
// Constants //
///////////////

const STATUS_EVENT = 'status';

/** Cap generated length so a runaway answer can't stall the palette. Higher than
 * a plain Q&A cap because a turn may spend tokens on tool calls before the reply. */
const MAX_TOKENS = 1500;

/** Context window. Pinned small (rather than node-llama-cpp's memory-hungry
 * "auto", which sizes to the model's full trained context) — the palette does
 * short one-shot Q&A, and this bounds KV-cache RAM to a few hundred MB. */
const CONTEXT_SIZE = 4096;

/** Unload the model after this long with no generation, reclaiming its RAM. The
 * next ask reloads it from disk in ~1–2s. */
const IDLE_UNLOAD_MS = 10 * 60 * 1000;

/** Steers the model toward short, direct answers in the inline palette. */
const SYSTEM_PROMPT_BASE =
  'You are Gemma, a concise, helpful assistant embedded in a developer tool (FlowState). ' +
  'Answer directly and briefly in Markdown. Prefer short paragraphs and code blocks where useful.';

/** How the model should use the action tools (see `gemmaTools.ts`). */
const TOOL_GUIDANCE = [
  'You can take actions with tools: search or list Linear issues, list Linear teams and workflow states,',
  'create a Linear ticket, create a git worktree/workspace, or create a ticket and a linked worktree together.',
  'Resolve ids before acting — call list_linear_teams to get a teamId before creating a ticket; never invent ids.',
  'Creating tickets or worktrees asks the user for confirmation (the app handles that) — just call the tool with',
  'your best arguments. If a call is denied, do not retry it. For plain questions, answer directly without tools.',
].join(' ');

/** Compose the system prompt for a turn, injecting the user's current focus so
 * tools can default their target. */
function buildSystemPrompt(ctx: ToolContext): string {
  const lines = [SYSTEM_PROMPT_BASE, TOOL_GUIDANCE];
  if (ctx.activeProjectId) {
    lines.push(`The active project id is ${ctx.activeProjectId} — use it as the default for new worktrees.`);
  }
  return lines.join('\n\n');
}

/////////////
// Helpers //
/////////////

let lib: Promise<Lib> | null = null;
function loadLib(): Promise<Lib> {
  lib ??= import('node-llama-cpp');
  return lib;
}

function modelsDir(): string {
  return join(app.getPath('userData'), 'models');
}

/** Resolve the download source for a spec, falling back to the model's first
 * listed quant if the picked one isn't published (mirrors the embedding path). */
function sourceForSpec(spec: ModelSpec): QuantSource {
  const def = LOCAL_MODELS[spec.modelId];
  const source = def.quants.find((q) => q.quant === spec.quant) ?? def.quants[0];
  if (!source) throw new Error(`No download source registered for model ${spec.modelId}`);
  return source;
}

/** The GGUF filenames of every generative (Gemma) tier — the files this service
 * owns for disk-usage reporting and deletion. */
function generativeFileNames(): Set<string> {
  return new Set(
    Object.values(LOCAL_MODELS)
      .filter((m) => m.kind === LocalModelKind.Generative)
      .flatMap((m) => m.quants.map((q) => q.file)),
  );
}

//////////////////
// GemmaService //
//////////////////

export class GemmaService extends EventEmitter {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private context: ChatContext | null = null;
  /** The resolved run plan (tier + quant), for logging/verification. */
  private spec: ModelSpec | null = null;

  private readyPromise: Promise<void> | null = null;
  /** Serializes generation — one context sequence, one prompt at a time. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Side-effecting tool calls parked awaiting the renderer's approve/deny, keyed
   * by call id (mirrors the permission-parking in `claude.ts`). */
  private pendingTools = new Map<string, PendingTool>();
  /** Fires IDLE_UNLOAD_MS after the last generation to free the model's RAM. */
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private status: ModelStatus = {
    state: LocalModelState.Absent,
    downloadProgress: null,
    modelId: '',
    error: null,
  };

  getStatus(): ModelStatus {
    return { ...this.status };
  }

  isReady(): boolean {
    return this.status.state === LocalModelState.Ready;
  }

  /** The resolved run plan (tier + quant), for logging/verification (null before
   * first load). Mirrors `localModelService.getSpec()`. */
  getSpec(): ModelSpec | null {
    return this.spec;
  }

  onStatus(listener: (status: ModelStatus) => void): () => void {
    this.on(STATUS_EVENT, listener);
    return () => this.off(STATUS_EVENT, listener);
  }

  private setStatus(patch: Partial<ModelStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit(STATUS_EVENT, this.getStatus());
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /** (Re)arm the idle timer; unrefed so it never keeps the process alive. */
  private scheduleIdleUnload(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.isReady()) {
        console.log('[gemma] unloading model after idle');
        void this.dispose();
      }
    }, IDLE_UNLOAD_MS);
    this.idleTimer.unref?.();
  }

  /** Download + load the RAM-appropriate Gemma tier. Idempotent, single-flight. */
  ensureReady(): Promise<void> {
    this.clearIdleTimer(); // a fresh request cancels a pending idle unload
    if (this.isReady()) return Promise.resolve();
    this.readyPromise ??= this.load().catch((err) => {
      this.readyPromise = null;
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus({ state: LocalModelState.Error, downloadProgress: null, error: message });
      throw err;
    });
    return this.readyPromise;
  }

  private async load(): Promise<void> {
    const { getLlama, createModelDownloader } = await loadLib();
    this.llama ??= await getLlama({ build: 'never' });
    const vram = await this.llama.getVramState();
    const hardware: HardwareProfile = {
      totalRamBytes: totalmem(),
      freeVramBytes: vram.free,
      gpu: this.llama.gpu,
    };
    const spec = selectGenerativeSpec(hardware, getGemmaTierPreference());
    const source = sourceForSpec(spec);
    this.spec = spec;
    this.setStatus({ modelId: spec.modelId, error: null });

    const dir = modelsDir();
    await mkdir(dir, { recursive: true });
    const modelPath = join(dir, source.file);

    if (!existsSync(modelPath)) {
      this.setStatus({ state: LocalModelState.Downloading, downloadProgress: 0 });
      const downloader = await createModelDownloader({
        modelUri: source.url,
        dirPath: dir,
        fileName: source.file,
        skipExisting: true,
        onProgress: ({ totalSize, downloadedSize }) => {
          const fraction = totalSize > 0 ? downloadedSize / totalSize : 0;
          this.setStatus({ downloadProgress: Math.min(1, fraction) });
        },
      });
      await downloader.download();
    }

    this.setStatus({ state: LocalModelState.Loading, downloadProgress: null });
    const t0 = Date.now();
    // useMmap lets the OS page weights in/out (less resident pressure); Flash
    // Attention shrinks the KV cache — both matter most for the 12B tier.
    this.model = await this.llama.loadModel({ modelPath, gpuLayers: spec.gpuLayers, useMmap: true });
    this.context = await this.model.createContext({ contextSize: CONTEXT_SIZE, flashAttention: true });
    console.log(
      `[gemma] loaded ${spec.modelId} (${spec.quant}) in ${Date.now() - t0}ms (gpu=${this.llama.gpu})`,
    );
    this.setStatus({ state: LocalModelState.Ready, error: null });
  }

  /**
   * Generate a response to `prompt`, streaming tokens and tool round-trips
   * through `handlers`. Loads the model on first use. The chat session stays
   * alive across the turn's tool calls (node-llama-cpp drives the call→result→
   * continue loop inside one `prompt()`), then is disposed. Serialized so
   * concurrent asks don't collide; honors `signal` for cancellation. `ctx` is the
   * user's current focus, used to default tool targets.
   */
  async generate(
    prompt: string,
    ctx: ToolContext,
    handlers: GenerateHandlers,
    signal?: AbortSignal,
  ): Promise<string> {
    await this.ensureReady();
    const { LlamaChatSession, defineChatSessionFunction } = await loadLib();
    const context = this.context;
    if (!context) throw new Error('Chat context unavailable after load.');

    const functions = buildToolFunctions(defineChatSessionFunction, ctx, {
      nextId: () => randomUUID(),
      gate: (call) => this.gateToolCall(call, handlers.onToolCall, signal),
      onResult: (result) => handlers.onToolResult(result),
    });

    const run = async (): Promise<string> => {
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: buildSystemPrompt(ctx),
      });
      try {
        const t0 = Date.now();
        let tokens = 0;
        const text = await session.prompt(prompt, {
          maxTokens: MAX_TOKENS,
          signal,
          functions,
          onTextChunk: (chunk) => {
            tokens++;
            handlers.onToken(chunk);
          },
        });
        console.log(`[gemma] generated ~${tokens} chunks in ${Date.now() - t0}ms`);
        return text;
      } finally {
        session.dispose({ disposeSequence: true });
        this.scheduleIdleUnload(); // start the idle countdown after each answer
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /**
   * Gate a tool call: always surface it to the renderer; auto-approve read-only
   * tools, but park side-effecting ones until the renderer answers via
   * `respondTool` (a denial — or the turn being aborted — resolves to not
   * approved so generation unwinds cleanly).
   */
  private gateToolCall(
    call: GemmaToolCall,
    emit: (call: GemmaToolCall) => void,
    signal?: AbortSignal,
  ): Promise<ToolDecision> {
    emit(call);
    if (!call.needsConfirmation) return Promise.resolve({ approved: true });
    if (signal?.aborted) return Promise.resolve({ approved: false });

    return new Promise<ToolDecision>((resolve) => {
      const settle = (decision: ToolDecision): void => {
        if (!this.pendingTools.delete(call.id)) return;
        signal?.removeEventListener('abort', onAbort);
        resolve(decision);
      };
      const onAbort = (): void => settle({ approved: false });
      this.pendingTools.set(call.id, { resolve: settle });
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** Resolve a parked tool call with the renderer's approve/deny answer. */
  respondTool(input: RespondGemmaToolInput): void {
    const pending = this.pendingTools.get(input.id);
    if (!pending) return;
    pending.resolve({ approved: input.approved, args: input.editedArgs ?? undefined });
  }

  /** On-disk size of the downloaded generative weights (all Gemma tiers present). */
  async getDiskInfo(): Promise<ModelDiskInfo> {
    const names = generativeFileNames();
    try {
      const dir = modelsDir();
      const files = await readdir(dir);
      let bytes = 0;
      for (const file of files) {
        if (names.has(file)) bytes += (await stat(join(dir, file))).size;
      }
      return { downloaded: bytes > 0, bytes };
    } catch {
      return { downloaded: false, bytes: 0 };
    }
  }

  /** Unload + delete the downloaded generative weights. Re-downloads on demand. */
  async deleteModel(): Promise<ModelDiskInfo> {
    await this.dispose();
    const names = generativeFileNames();
    try {
      const dir = modelsDir();
      const files = await readdir(dir);
      await Promise.all(
        files.filter((f) => names.has(f)).map((f) => unlink(join(dir, f)).catch(() => undefined)),
      );
    } catch {
      // Nothing to delete.
    }
    return this.getDiskInfo();
  }

  /** Unload so the next ask re-selects a tier/quant — used when the tier
   * preference changes in settings. */
  async reload(): Promise<void> {
    await this.dispose();
  }

  async dispose(): Promise<void> {
    this.clearIdleTimer();
    // Release any parked tool confirmations so their generate() calls unwind.
    for (const [, pending] of this.pendingTools) pending.resolve({ approved: false });
    this.pendingTools.clear();
    try {
      await this.context?.dispose();
      await this.model?.dispose();
    } catch {
      // Best-effort teardown.
    }
    this.context = null;
    this.model = null;
    this.readyPromise = null;
    this.setStatus({ state: LocalModelState.Absent, downloadProgress: null });
  }
}

/** Process-wide singleton. */
export const gemmaService = new GemmaService();
