/**
 * Local-model runtime domain enums (main-process only — the Gemma-family models
 * FlowState runs on-device via node-llama-cpp never cross into shared). The
 * registry, the hardware-driven spec selector, and the embedding service all
 * dispatch on these instead of loose wire strings.
 */

/** On-device models FlowState can run: EmbeddingGemma powers semantic search;
 * the generative Gemma 3 tiers power the "Ask Gemma" palette (one is picked by
 * available RAM). */
export enum LocalModelId {
  EmbeddingGemma300m = 'embeddinggemma-300m',
  Gemma3_1b = 'gemma-3-1b-it',
  Gemma3_4b = 'gemma-3-4b-it',
  Gemma3_12b = 'gemma-3-12b-it',
}

/** What a model is used for — decides how it's loaded (an embedding context vs.
 * a chat/completion session) and which needs the spec selector optimizes for. */
export enum LocalModelKind {
  Embedding = 'embedding',
  Generative = 'generative',
}

/** GGUF quantization levels we ship download sources for. Picked by available
 * RAM: Q4 (smallest, QAT-trained so quality holds) on constrained machines, Q8
 * when there's headroom. Generative Gemma ships as Q4_K_M (the quality/size
 * sweet spot for local chat). */
export enum ModelQuant {
  Q4_0 = 'Q4_0',
  Q8_0 = 'Q8_0',
  Q4_K_M = 'Q4_K_M',
}

/** EmbeddingGemma is asymmetric: search queries and the documents they retrieve
 * get different task prompts, so callers tag which side they're embedding. */
export enum EmbedRole {
  Document = 'document',
  Query = 'query',
}
