/**
 * Curated Claude models always offered in the model picker, independent of what
 * the Agent SDK's `Query.supportedModels()` reports for a given session/plan
 * (which can be a narrow subset — e.g. only Haiku). Both processes share this
 * list: the main process merges live SDK models on top, and the renderer seeds
 * the picker with it so the choices show immediately and never shrink below it.
 */
import { ReasoningEffort } from '../enums/claude';
import type { ModelOption } from '../types/claude';

/** Default model + effort for a new session when the user hasn't picked one. */
export const DEFAULT_MODEL = 'claude-opus-4-8';
export const DEFAULT_EFFORT = ReasoningEffort.High;

export const CURATED_MODELS: ModelOption[] = [
  {
    value: 'claude-opus-4-8',
    displayName: 'Opus 4.8',
    description: 'Most capable — deep reasoning and complex tasks.',
    supportsEffort: true,
    supportedEffortLevels: [
      ReasoningEffort.Low,
      ReasoningEffort.Medium,
      ReasoningEffort.High,
      ReasoningEffort.XHigh,
      ReasoningEffort.Max,
    ],
  },
  {
    value: 'claude-sonnet-5',
    displayName: 'Sonnet 5',
    description: 'Balanced speed and capability.',
    supportsEffort: true,
    supportedEffortLevels: [
      ReasoningEffort.Low,
      ReasoningEffort.Medium,
      ReasoningEffort.High,
      ReasoningEffort.XHigh,
    ],
  },
  {
    value: 'claude-haiku-4-5',
    displayName: 'Haiku 4.5',
    description: 'Fastest — lightweight everyday tasks.',
    supportsEffort: false,
    supportedEffortLevels: [],
  },
];

/** Merge live SDK models onto the curated base, deduped by value (curated wins). */
export function mergeModelOptions(live: ModelOption[]): ModelOption[] {
  const merged = [...CURATED_MODELS];
  const known = new Set(merged.map((m) => m.value));
  for (const option of live) {
    if (!known.has(option.value)) {
      merged.push(option);
      known.add(option.value);
    }
  }
  return merged;
}
