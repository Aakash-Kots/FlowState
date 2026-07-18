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
export const DEFAULT_MODEL = 'claude-opus-4-8';
export const DEFAULT_EFFORT = ReasoningEffort.High;

export const CURATED_MODELS: ModelOption[] = [
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
    value: 'claude-opus-4-8',
    displayName: 'Opus 4.8',
    description: 'Deep reasoning and complex tasks.',
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

/** Prefer the live SDK list; fall back to the curated base only when it's empty. */
export function resolveModelOptions(live: ModelOption[]): ModelOption[] {
  return live.length > 0 ? live : CURATED_MODELS;
}
