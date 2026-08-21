/**
 * Local-model runtime domain enums (main-process only — the EmbeddingGemma model
 * FlowState runs on-device via node-llama-cpp never crosses into shared). The
 * registry, the hardware-driven spec selector, and the embedding service all
 * dispatch on these instead of loose wire strings.
 */

/** On-device models FlowState can run: EmbeddingGemma powers semantic search.
 * (The generative assistant now runs on the hosted Gemini API.) */
export enum LocalModelId {
  EmbeddingGemma300m = 'embeddinggemma-300m',
}

/** What a model is used for — decides how it's loaded. Only embedding models run
 * on-device now; kept as an enum so the registry stays self-describing. */
export enum LocalModelKind {
  Embedding = 'embedding',
}

/** GGUF quantization levels we ship EmbeddingGemma download sources for. Picked
 * by available RAM: Q4 (smallest, QAT-trained so quality holds) on constrained
 * machines, Q8 when there's headroom. */
export enum ModelQuant {
  Q4_0 = 'Q4_0',
  Q8_0 = 'Q8_0',
}

/** EmbeddingGemma is asymmetric: search queries and the documents they retrieve
 * get different task prompts, so callers tag which side they're embedding. */
export enum EmbedRole {
  Document = 'document',
  Query = 'query',
}
