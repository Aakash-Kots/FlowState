/**
 * Runtime validation for the Ask-Gemma domain. Mirrors `../types/gemma` and is
 * parsed at the tRPC boundary (subscription output, mutation inputs).
 */
import { z } from 'zod';
import { GemmaStreamKind, GemmaTierPreference } from '../enums/gemma';
import type {
  GemmaAskInput,
  GemmaPrefs,
  GemmaStreamEvent,
  GemmaToolCall,
  GemmaToolResult,
  RespondGemmaToolInput,
  SetGemmaTierInput,
} from '../types/gemma';

const jsonArgs = z.record(z.unknown());

export const gemmaAskInputSchema: z.ZodType<GemmaAskInput> = z.object({
  prompt: z.string().min(1),
  context: z
    .object({
      activeProjectId: z.string().nullish(),
      activeWorkspaceId: z.string().nullish(),
    })
    .nullish(),
});

export const gemmaToolCallSchema: z.ZodType<GemmaToolCall> = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  args: jsonArgs,
  needsConfirmation: z.boolean(),
});

export const gemmaToolResultSchema: z.ZodType<GemmaToolResult> = z.object({
  id: z.string(),
  name: z.string(),
  ok: z.boolean(),
  summary: z.string(),
});

export const gemmaStreamEventSchema: z.ZodType<GemmaStreamEvent> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(GemmaStreamKind.Token), text: z.string() }),
  z.object({ kind: z.literal(GemmaStreamKind.Done), text: z.string() }),
  z.object({ kind: z.literal(GemmaStreamKind.Error), text: z.string() }),
  z.object({ kind: z.literal(GemmaStreamKind.ToolCall), toolCall: gemmaToolCallSchema }),
  z.object({ kind: z.literal(GemmaStreamKind.ToolResult), toolResult: gemmaToolResultSchema }),
]);

export const respondGemmaToolInputSchema: z.ZodType<RespondGemmaToolInput> = z.object({
  id: z.string(),
  approved: z.boolean(),
  editedArgs: jsonArgs.nullish(),
});

export const gemmaPrefsSchema: z.ZodType<GemmaPrefs> = z.object({
  tierPreference: z.nativeEnum(GemmaTierPreference),
});

export const setGemmaTierInputSchema: z.ZodType<SetGemmaTierInput> = z.object({
  preference: z.nativeEnum(GemmaTierPreference),
});
