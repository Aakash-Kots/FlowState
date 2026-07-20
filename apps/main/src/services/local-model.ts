/**
 * LocalModelService — runs Gemma-family models on-device via node-llama-cpp.
 *
 * Today it hosts one model, EmbeddingGemma, which powers semantic search; the
 * registry (`LOCAL_MODELS`) and the hardware-driven `selectSpec` are shaped so a
 * generative Gemma tier can be added later without touching callers. Concretely
 * it: profiles the machine (GPU + free VRAM + total RAM), picks a quantization
 * and Matryoshka output width to fit (`ModelSpec`), downloads the GGUF once into
 * `userData/models` (the app has no other runtime-download path), loads it with
 * Metal offload, and turns text into L2-normalized embedding vectors.
 *
 * Like `claude.ts`, node-llama-cpp is ESM-only in this CJS bundle, so it is
 * loaded via a real dynamic import() (never a top-level value import), and the
 * service is a stateful singleton that fans model-state changes out to the
 * renderer over a tRPC subscription (`search.onModelProgress`).
 */
import { EventEmitter } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { totalmem } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import { LocalModelState, type ModelStatus } from '@flowstate/shared';
import {
  EMBED_QUERY_PREFIX,
  LOCAL_MODELS,
  RAM_COMFORTABLE_BYTES,
  SEARCH_EMBEDDING_MODEL,
} from '../lib/constants/local-model';
import { EmbedRole, LocalModelId, ModelQuant } from '../lib/enums/local-model';
import type { HardwareProfile, ModelSpec, QuantSource } from '../lib/types/local-model';

///////////
// Types //
///////////

type Lib = typeof import('node-llama-cpp');
type Llama = Awaited<ReturnType<Lib['getLlama']>>;
type LlamaModel = Awaited<ReturnType<Llama['loadModel']>>;
type EmbeddingContext = Awaited<ReturnType<LlamaModel['createEmbeddingContext']>>;

///////////////
// Constants //
///////////////

/** Event name the service emits a fresh `ModelStatus` snapshot on. */
const STATUS_EVENT = 'status';

/////////////
// Helpers //
/////////////

let lib: Promise<Lib> | null = null;
/** Memoized dynamic import — node-llama-cpp is ESM-only (see `claude.ts:loadSdk`). */
function loadLib(): Promise<Lib> {
  lib ??= import('node-llama-cpp');
  return lib;
}

/** Writable cache dir for downloaded weights — resources are read-only, so this
 * sits beside `flowstate.db` under userData. */
function modelsDir(): string {
  return join(app.getPath('userData'), 'models');
}

/**
 * Pick the quantization + Matryoshka width that fits the machine. More RAM →
 * the higher-fidelity Q8 weights and the full 768-dim vector; constrained → the
 * QAT Q4 weights and a 256-dim vector (faster cosine, less storage, small recall
 * cost). GPU present → let node-llama-cpp offload as many layers as fit.
 */
function selectSpec(hardware: HardwareProfile): ModelSpec {
  const comfortable = hardware.totalRamBytes >= RAM_COMFORTABLE_BYTES;
  return {
    modelId: SEARCH_EMBEDDING_MODEL,
    quant: comfortable ? ModelQuant.Q8_0 : ModelQuant.Q4_0,
    dim: comfortable ? 768 : 256,
    gpuLayers: hardware.gpu ? 'auto' : 0,
  };
}

/** Resolve the download source for a spec, falling back to the model's first
 * listed quant if the preferred one isn't published. */
function sourceForSpec(spec: ModelSpec): QuantSource {
  const def = LOCAL_MODELS[spec.modelId];
  const source = def.quants.find((q) => q.quant === spec.quant) ?? def.quants[0];
  if (!source) throw new Error(`No download source registered for model ${spec.modelId}`);
  return source;
}

/** Truncate an embedding to `dim` (Matryoshka) and L2-normalize so cosine
 * similarity reduces to a dot product. */
function truncateNormalize(vector: readonly number[], dim: number): Float32Array {
  const width = Math.min(dim, vector.length);
  let sumSq = 0;
  for (let i = 0; i < width; i++) {
    const v = vector[i] ?? 0;
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq) || 1;
  const out = new Float32Array(width);
  for (let i = 0; i < width; i++) out[i] = (vector[i] ?? 0) / norm;
  return out;
}

/** Apply EmbeddingGemma's asymmetric task prompt for the side being embedded. */
function withPrompt(text: string, role: EmbedRole): string {
  return role === EmbedRole.Query ? `${EMBED_QUERY_PREFIX}${text}` : text;
}

///////////////////////
// LocalModelService //
///////////////////////

export class LocalModelService extends EventEmitter {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private context: EmbeddingContext | null = null;
  private spec: ModelSpec | null = null;

  /** Single-flight guard so concurrent `embed()` calls share one load/download. */
  private readyPromise: Promise<void> | null = null;
  /** Serializes `getEmbeddingFor` calls — one embedding context, one at a time. */
  private queue: Promise<unknown> = Promise.resolve();

  private status: ModelStatus = {
    state: LocalModelState.Absent,
    downloadProgress: null,
    modelId: SEARCH_EMBEDDING_MODEL,
    error: null,
  };

  /** The model's current lifecycle state (polled by `search.modelStatus`). */
  getStatus(): ModelStatus {
    return { ...this.status };
  }

  /** True once weights are downloaded and loaded — the query path checks this to
   * decide whether to run now or report `modelReady: false` and let the UI wait. */
  isReady(): boolean {
    return this.status.state === LocalModelState.Ready;
  }

  /** The resolved run plan, for logging/verification (null before first load). */
  getSpec(): ModelSpec | null {
    return this.spec;
  }

  /** Subscribe to model-state changes; returns an unsubscribe fn. */
  onStatus(listener: (status: ModelStatus) => void): () => void {
    this.on(STATUS_EVENT, listener);
    return () => this.off(STATUS_EVENT, listener);
  }

  private setStatus(patch: Partial<ModelStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit(STATUS_EVENT, this.getStatus());
  }

  /**
   * Ensure the model is downloaded and loaded. Idempotent and single-flight: the
   * first caller drives download → load and everyone awaits the same promise. On
   * failure the guard is cleared so a later call can retry.
   */
  ensureReady(): Promise<void> {
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
    // `build: 'never'` guarantees we only ever use the shipped prebuilt N-API
    // binary — never trigger a cmake compile in a packaged app with no toolchain.
    this.llama ??= await getLlama({ build: 'never' });
    const vram = await this.llama.getVramState();
    const hardware: HardwareProfile = {
      totalRamBytes: totalmem(),
      freeVramBytes: vram.free,
      gpu: this.llama.gpu,
    };
    const spec = selectSpec(hardware);
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
    this.model = await this.llama.loadModel({ modelPath, gpuLayers: spec.gpuLayers });
    this.context = await this.model.createEmbeddingContext();
    this.setStatus({ state: LocalModelState.Ready, error: null });
  }

  /**
   * Embed a batch of texts. Downloads/loads the model on first use, applies
   * EmbeddingGemma's task prompt for the given `role`, and returns L2-normalized
   * vectors truncated to the selected Matryoshka width. Runs sequentially — one
   * embedding context — but each call queues so callers never interleave.
   */
  async embed(texts: string[], role: EmbedRole): Promise<Float32Array[]> {
    await this.ensureReady();
    const context = this.context;
    const dim = this.spec?.dim ?? LOCAL_MODELS[SEARCH_EMBEDDING_MODEL].nativeDim;
    if (!context) throw new Error('Embedding context unavailable after load.');

    const run = async (): Promise<Float32Array[]> => {
      const out: Float32Array[] = [];
      for (const text of texts) {
        const embedding = await context.getEmbeddingFor(withPrompt(text, role));
        out.push(truncateNormalize(embedding.vector, dim));
      }
      return out;
    };
    const result = this.queue.then(run, run);
    // Keep the chain alive but don't let a rejection poison the next caller.
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Dispose the loaded model/context (called on app quit). */
  async dispose(): Promise<void> {
    try {
      await this.context?.dispose();
      await this.model?.dispose();
    } catch {
      // Best-effort teardown on quit.
    }
    this.context = null;
    this.model = null;
    this.readyPromise = null;
    this.setStatus({ state: LocalModelState.Absent, downloadProgress: null });
  }
}

/** Process-wide singleton (mirrors `claudeService`, `linearService`). */
export const localModelService = new LocalModelService();

export { EmbedRole, LocalModelId };
