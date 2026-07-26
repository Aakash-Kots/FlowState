/**
 * Curated Claude models used as the model picker's fallback when the Agent SDK's
 * `Query.supportedModels()` reports nothing (no live session yet, offline, or an
 * error). When the SDK does report models, that live list wins outright — the
 * picker shows exactly what Claude returns for the session/plan. Both processes
 * share this list: the renderer also seeds the picker with it so choices show
 * immediately before the first live fetch resolves.
 */
import { ReasoningEffort } from '../enums/claude';
import type { ModelOption } from '../types/claude';

/** Default model + effort for a new session when the user hasn't picked one. */
export const DEFAULT_MODEL = 'claude-opus-5';
export const DEFAULT_EFFORT = ReasoningEffort.High;

/**
 * Opus 5 option, defined once so {@link resolveModelOptions} can inject it into
 * whichever base list is shown when the live SDK list doesn't include it yet.
 */
const OPUS_5: ModelOption = {
  value: 'claude-opus-5',
  displayName: 'Opus 5',
  description: 'Most capable — deep reasoning and complex, long-horizon work.',
  supportsEffort: true,
  supportedEffortLevels: [
    ReasoningEffort.Low,
    ReasoningEffort.Medium,
    ReasoningEffort.High,
    ReasoningEffort.XHigh,
    ReasoningEffort.Max,
  ],
};

/** Models hidden from the picker regardless of what the SDK reports. */
const HIDDEN_MODELS = new Set<string>(['claude-opus-4-8']);

export const CURATED_MODELS: ModelOption[] = [
  OPUS_5,
  {
    value: 'claude-fable-5',
    displayName: 'Fable 5',
    description: 'Most capable — the most demanding reasoning and long-horizon work.',
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

/**
 * Prefer the live SDK list; fall back to the curated base only when it's empty.
 * Either way, hide {@link HIDDEN_MODELS} and guarantee Opus 5 is present — this
 * is the single choke point every consumer of the model list goes through.
 */
export function resolveModelOptions(live: ModelOption[]): ModelOption[] {
  const base = live.length > 0 ? live : CURATED_MODELS;
  const filtered = base.filter((m) => !HIDDEN_MODELS.has(m.value));
  return filtered.some((m) => m.value === OPUS_5.value) ? filtered : [OPUS_5, ...filtered];
}
