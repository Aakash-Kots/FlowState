/**
 * Local-model runtime types (main process) — in-memory shapes the model
 * registry, the hardware profiler, and the embedding service pass around. None
 * cross an IPC boundary as-is (the renderer only sees the tRPC search shapes in
 * `@flowstate/shared`), so no zod schema is needed here.
 */
import type { LocalModelId, LocalModelKind, ModelQuant } from '../enums/local-model';

/** A downloadable GGUF for one quantization of a model. */
export type QuantSource = {
  quant: ModelQuant;
  /** Hugging Face repo id (ungated mirror — no auth token required). */
  repo: string;
  /** GGUF filename within the repo. */
  file: string;
  /** Direct download URL, handed to node-llama-cpp's downloader. */
  url: string;
  /** Rough on-disk size, for the free-space guard and the download UI. */
  approxBytes: number;
};

/** A registry entry: one model and every quant we can fetch for it. */
export type LocalModelDef = {
  id: LocalModelId;
  kind: LocalModelKind;
  /** The model's full embedding width (before Matryoshka truncation). */
  nativeDim: number;
  quants: QuantSource[];
};

/** A snapshot of the machine's capacity, sampled once to pick a spec. */
export type HardwareProfile = {
  totalRamBytes: number;
  /** Free VRAM/unified memory as reported by the llama backend. */
  freeVramBytes: number;
  /** The active GPU backend ('metal', 'cuda', …) or false for CPU-only. */
  gpu: string | false;
};

/**
 * The concrete plan for running a model, resolved from the registry + hardware.
 * `dim` is the Matryoshka output width (≤ the model's `nativeDim`); `gpuLayers`
 * is 'auto' to let node-llama-cpp offload as much as fits, or 0 to force CPU.
 */
export type ModelSpec = {
  modelId: LocalModelId;
  quant: ModelQuant;
  dim: number;
  gpuLayers: number | 'auto';
};
