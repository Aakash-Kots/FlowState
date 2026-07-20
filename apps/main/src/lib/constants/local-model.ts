/**
 * The on-device model registry (main-process only). Each entry lists the GGUF
 * download sources per quantization; the embedding service picks one by hardware
 * (see `selectSpec`) and hands its URL to node-llama-cpp's downloader, which
 * caches the weights under `userData/models` on first use. Sources are ungated
 * `ggml-org` mirrors (maintained by the llama.cpp team) so no Hugging Face auth
 * token is ever required.
 */
import { LocalModelId, LocalModelKind, ModelQuant } from '../enums/local-model';
import type { LocalModelDef } from '../types/local-model';

const HF = 'https://huggingface.co';

/** One generative Gemma tier: an ungated Q4_K_M GGUF and its rough size. */
const gemmaTier = (
  id: LocalModelId,
  slug: string,
  approxBytes: number,
): LocalModelDef => ({
  id,
  kind: LocalModelKind.Generative,
  nativeDim: 0, // not an embedding model
  quants: [
    {
      quant: ModelQuant.Q4_K_M,
      repo: `ggml-org/${slug}-GGUF`,
      file: `${slug}-Q4_K_M.gguf`,
      url: `${HF}/ggml-org/${slug}-GGUF/resolve/main/${slug}-Q4_K_M.gguf`,
      approxBytes,
    },
  ],
});

/** Registry of runnable models: EmbeddingGemma for search + generative Gemma 3
 * tiers for the Ask palette (one picked by RAM — see `selectGenerativeModel`). */
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
  [LocalModelId.Gemma3_1b]: gemmaTier(LocalModelId.Gemma3_1b, 'gemma-3-1b-it', 810 * 1024 * 1024),
  [LocalModelId.Gemma3_4b]: gemmaTier(LocalModelId.Gemma3_4b, 'gemma-3-4b-it', 2600 * 1024 * 1024),
  [LocalModelId.Gemma3_12b]: gemmaTier(LocalModelId.Gemma3_12b, 'gemma-3-12b-it', 7300 * 1024 * 1024),
};

/** RAM thresholds (bytes) for the generative-model tier picker. */
const GEMMA_RAM_LARGE = 32 * 1024 * 1024 * 1024;
const GEMMA_RAM_MEDIUM = 12 * 1024 * 1024 * 1024;

/** Pick the largest Gemma 3 tier that comfortably fits total RAM: 12B on a big
 * machine, 4B on a typical laptop, 1B when memory is tight. */
export function selectGenerativeModel(totalRamBytes: number): LocalModelId {
  if (totalRamBytes >= GEMMA_RAM_LARGE) return LocalModelId.Gemma3_12b;
  if (totalRamBytes >= GEMMA_RAM_MEDIUM) return LocalModelId.Gemma3_4b;
  return LocalModelId.Gemma3_1b;
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
