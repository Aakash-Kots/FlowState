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
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { totalmem } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import { LocalModelState, type ModelDiskInfo, type ModelStatus } from '@flowstate/shared';
import { LOCAL_MODELS, selectGenerativeModel } from '../lib/constants/local-model';
import { LocalModelKind, type LocalModelId } from '../lib/enums/local-model';
import type { QuantSource } from '../lib/types/local-model';

///////////
// Types //
///////////

type Lib = typeof import('node-llama-cpp');
type Llama = Awaited<ReturnType<Lib['getLlama']>>;
type LlamaModel = Awaited<ReturnType<Llama['loadModel']>>;
type ChatContext = Awaited<ReturnType<LlamaModel['createContext']>>;

///////////////
// Constants //
///////////////

const STATUS_EVENT = 'status';

/** Cap generated length so a runaway answer can't stall the palette. */
const MAX_TOKENS = 800;

/** Context window. Pinned small (rather than node-llama-cpp's memory-hungry
 * "auto", which sizes to the model's full trained context) — the palette does
 * short one-shot Q&A, and this bounds KV-cache RAM to a few hundred MB. */
const CONTEXT_SIZE = 4096;

/** Unload the model after this long with no generation, reclaiming its RAM. The
 * next ask reloads it from disk in ~1–2s. */
const IDLE_UNLOAD_MS = 10 * 60 * 1000;

/** Steers the model toward short, direct answers in the inline palette. */
const SYSTEM_PROMPT =
  'You are Gemma, a concise, helpful assistant embedded in a developer tool. ' +
  'Answer directly and briefly in Markdown. Prefer short paragraphs and code blocks where useful.';

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

function sourceFor(modelId: LocalModelId): QuantSource {
  const source = LOCAL_MODELS[modelId].quants[0];
  if (!source) throw new Error(`No download source registered for model ${modelId}`);
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

  private readyPromise: Promise<void> | null = null;
  /** Serializes generation — one context sequence, one prompt at a time. */
  private queue: Promise<unknown> = Promise.resolve();
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
    const modelId = selectGenerativeModel(totalmem());
    const source = sourceFor(modelId);
    this.setStatus({ modelId, error: null });

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
    this.model = await this.llama.loadModel({ modelPath, gpuLayers: this.llama.gpu ? 'auto' : 0 });
    this.context = await this.model.createContext({ contextSize: CONTEXT_SIZE });
    console.log(`[gemma] loaded ${modelId} in ${Date.now() - t0}ms (gpu=${this.llama.gpu})`);
    this.setStatus({ state: LocalModelState.Ready, error: null });
  }

  /**
   * Generate a response to `prompt`, streaming tokens through `onToken`. Loads
   * the model on first use. One-shot: each call runs on a fresh, history-free
   * chat session, serialized so concurrent asks don't collide. Returns the full
   * text; honors `signal` for cancellation.
   */
  async generate(prompt: string, onToken: (text: string) => void, signal?: AbortSignal): Promise<string> {
    await this.ensureReady();
    const { LlamaChatSession } = await loadLib();
    const context = this.context;
    if (!context) throw new Error('Chat context unavailable after load.');

    const run = async (): Promise<string> => {
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: SYSTEM_PROMPT,
      });
      try {
        const t0 = Date.now();
        let tokens = 0;
        const text = await session.prompt(prompt, {
          maxTokens: MAX_TOKENS,
          signal,
          onTextChunk: (chunk) => {
            tokens++;
            onToken(chunk);
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

  async dispose(): Promise<void> {
    this.clearIdleTimer();
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
