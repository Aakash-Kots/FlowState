/**
 * The on-device model registry (main-process only). Each entry lists the GGUF
 * download sources per quantization; the embedding service picks one by hardware
 * (see `selectSpec`) and hands its URL to node-llama-cpp's downloader, which
 * caches the weights under `userData/models` on first use. Sources are ungated
 * `ggml-org` mirrors (maintained by the llama.cpp team) so no Hugging Face auth
 * token is ever required.
 */
import { GemmaTierPreference } from '@flowstate/shared';
import { LocalModelId, LocalModelKind, ModelQuant } from '../enums/local-model';
import type { HardwareProfile, LocalModelDef, ModelSpec, QuantSource } from '../types/local-model';

const HF = 'https://huggingface.co';

/** The ggml-org Q4_K_M GGUF for a Gemma tier (ungated, maintained by the
 * llama.cpp team) — the default quant for every tier. */
const ggmlQ4 = (slug: string, approxBytes: number): QuantSource => ({
  quant: ModelQuant.Q4_K_M,
  repo: `ggml-org/${slug}-GGUF`,
  file: `${slug}-Q4_K_M.gguf`,
  url: `${HF}/ggml-org/${slug}-GGUF/resolve/main/${slug}-Q4_K_M.gguf`,
  approxBytes,
});

/** A lower-bit quant from bartowski's ungated mirror (no auth token) — used for
 * quants ggml-org doesn't publish, so 12B can fit machines below the Q4 floor. */
const bartowskiQuant = (slug: string, quant: ModelQuant, approxBytes: number): QuantSource => {
  const repo = `bartowski/google_${slug}-GGUF`;
  const file = `google_${slug}-${quant}.gguf`;
  return { quant, repo, file, url: `${HF}/${repo}/resolve/main/${file}`, approxBytes };
};

/** One generative Gemma tier and every quant we can fetch for it. */
const gemmaTier = (id: LocalModelId, quants: QuantSource[]): LocalModelDef => ({
  id,
  kind: LocalModelKind.Generative,
  nativeDim: 0, // not an embedding model
  quants,
});

/** Registry of runnable models: EmbeddingGemma for search + generative Gemma 3
 * tiers for the Ask palette (one picked by RAM — see `selectGenerativeSpec`). */
export const LOCAL_MODELS: Record<LocalModelId, LocalModelDef> = {
  [LocalModelId.EmbeddingGemma300m]: {
    id: LocalModelId.EmbeddingGemma300m,
    kind: LocalModelKind.Embedding,
    nativeDim: 768,
    quants: [
      {
        quant: ModelQuant.Q4_0,
        repo: 'ggml-org/embeddinggemma-300M-qat-q4_0-GGUF',
        file: 'embeddinggemma-300M-qat-Q4_0.gguf',
        url: `${HF}/ggml-org/embeddinggemma-300M-qat-q4_0-GGUF/resolve/main/embeddinggemma-300M-qat-Q4_0.gguf`,
        approxBytes: 240 * 1024 * 1024,
      },
      {
        quant: ModelQuant.Q8_0,
        repo: 'ggml-org/embeddinggemma-300M-GGUF',
        file: 'embeddinggemma-300M-Q8_0.gguf',
        url: `${HF}/ggml-org/embeddinggemma-300M-GGUF/resolve/main/embeddinggemma-300M-Q8_0.gguf`,
        approxBytes: 320 * 1024 * 1024,
      },
    ],
  },
  [LocalModelId.Gemma3_1b]: gemmaTier(LocalModelId.Gemma3_1b, [ggmlQ4('gemma-3-1b-it', 810 * 1024 * 1024)]),
  [LocalModelId.Gemma3_4b]: gemmaTier(LocalModelId.Gemma3_4b, [ggmlQ4('gemma-3-4b-it', 2600 * 1024 * 1024)]),
  [LocalModelId.Gemma3_12b]: gemmaTier(LocalModelId.Gemma3_12b, [
    ggmlQ4('gemma-3-12b-it', 7300 * 1024 * 1024),
    bartowskiQuant('gemma-3-12b-it', ModelQuant.Q3_K_M, 6000 * 1024 * 1024),
  ]),
};

/**
 * Total-RAM thresholds (bytes) for the generative tier + quant picker. The 12B
 * tier is reachable two ways: its full Q4_K_M (~7.3GB weights) once there's
 * comfortable headroom, or the smaller Q3_K_M (~6GB) down to a tighter floor so
 * tool-capable 12B runs on more machines. 4B fills the gap below that, 1B when
 * memory is very tight.
 */
const GEMMA_RAM_12B_Q4 = 24 * 1024 * 1024 * 1024;
const GEMMA_RAM_12B_Q3 = 16 * 1024 * 1024 * 1024;
const GEMMA_RAM_4B = 12 * 1024 * 1024 * 1024;

/** Map a manual tier preference to its model id (Auto is resolved by RAM). */
function forcedTier(preference: GemmaTierPreference): LocalModelId | null {
  switch (preference) {
    case GemmaTierPreference.Force12b:
      return LocalModelId.Gemma3_12b;
    case GemmaTierPreference.Force4b:
      return LocalModelId.Gemma3_4b;
    case GemmaTierPreference.Force1b:
      return LocalModelId.Gemma3_1b;
    case GemmaTierPreference.Auto:
    default:
      return null;
  }
}

/** The largest tier RAM can auto-select: 12B whenever a 12B quant fits (Q3 from
 * 16GB, Q4 from 24GB), else 4B, else 1B. */
function autoTier(totalRamBytes: number): LocalModelId {
  if (totalRamBytes >= GEMMA_RAM_12B_Q3) return LocalModelId.Gemma3_12b;
  if (totalRamBytes >= GEMMA_RAM_4B) return LocalModelId.Gemma3_4b;
  return LocalModelId.Gemma3_1b;
}

/** Best quant to run a tier at on this machine: only 12B has a choice — its full
 * Q4_K_M with headroom, else the smaller Q3_K_M. Other tiers ship one quant. */
function quantForTier(modelId: LocalModelId, totalRamBytes: number): ModelQuant {
  if (modelId === LocalModelId.Gemma3_12b && totalRamBytes < GEMMA_RAM_12B_Q4) {
    return ModelQuant.Q3_K_M;
  }
  return ModelQuant.Q4_K_M;
}

/**
 * Resolve the concrete run plan (tier + quant + GPU offload) for the Ask palette
 * from the machine's RAM and the user's tier preference. `Auto` picks the
 * largest tier/quant that fits; a `Force*` preference pins the tier and still
 * picks the quant that fits it. Mirrors the embedding `selectSpec`.
 */
export function selectGenerativeSpec(
  hardware: HardwareProfile,
  preference: GemmaTierPreference,
): ModelSpec {
  const modelId = forcedTier(preference) ?? autoTier(hardware.totalRamBytes);
  return {
    modelId,
    quant: quantForTier(modelId, hardware.totalRamBytes),
    dim: 0, // generative models produce text, not an embedding vector
    gpuLayers: hardware.gpu ? 'auto' : 0,
  };
}

/** The model semantic search runs on. Kept as a named constant so the search
 * service and router don't hard-code the id. */
export const SEARCH_EMBEDDING_MODEL = LocalModelId.EmbeddingGemma300m;

/**
 * EmbeddingGemma's task-specific prompt templates — retrieval quality drops
 * sharply without them. Documents are embedded with a title|text frame; search
 * queries with the search-result task prefix. (Google's published templates.)
 */
export const EMBED_QUERY_PREFIX = 'task: search result | query: ';
export const embedDocumentText = (title: string, body: string): string =>
  `title: ${title.trim() || 'none'} | text: ${body}`;

/**
 * Matryoshka output widths EmbeddingGemma supports truncating to (from its 768
 * native width). Smaller = faster cosine and less storage at a small recall
 * cost; `selectSpec` picks by available memory. Truncated vectors are
 * re-normalized so cosine stays a dot product.
 */
export const MATRYOSHKA_DIMS = [128, 256, 512, 768] as const;

/** RAM thresholds (bytes) for the spec selector's quant/dim choices. */
export const RAM_COMFORTABLE_BYTES = 16 * 1024 * 1024 * 1024;
