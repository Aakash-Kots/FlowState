/**
 * The on-device model registry (main-process only). The embedding service picks
 * a quant by hardware (see `selectSpec`) and hands its URL to node-llama-cpp's
 * downloader, which caches the weights under `userData/models` on first use.
 * Sources are ungated `ggml-org` mirrors (maintained by the llama.cpp team) so
 * no Hugging Face auth token is ever required. (The generative assistant now
 * runs on the hosted Gemini API — see `services/gemini.ts` — so only the search
 * embedding model runs locally.)
 */
import { LocalModelId, LocalModelKind, ModelQuant } from '../enums/local-model';
import type { LocalModelDef } from '../types/local-model';

const HF = 'https://huggingface.co';

/** Registry of on-device models: EmbeddingGemma powers semantic search (one
 * quant picked by RAM — see the embedding service's `selectSpec`). */
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
};

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
