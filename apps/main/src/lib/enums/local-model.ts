/**
 * Local-model runtime domain enums (main-process only — the Gemma-family models
 * FlowState runs on-device via node-llama-cpp never cross into shared). The
 * registry, the hardware-driven spec selector, and the embedding service all
 * dispatch on these instead of loose wire strings.
 */

/** On-device models FlowState can run. Seeded with the embedding model that
 * powers semantic search; generative Gemma tiers slot in here later. */
export enum LocalModelId {
  EmbeddingGemma300m = 'embeddinggemma-300m',
}

/** What a model is used for — decides how it's loaded (embedding context vs. a
 * chat/completion context) and which needs the spec selector optimizes for. */
export enum LocalModelKind {
  Embedding = 'embedding',
}

/** GGUF quantization levels we ship download sources for. Picked by available
 * RAM: Q4 (smallest, QAT-trained so quality holds) on constrained machines, Q8
 * when there's headroom. */
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
