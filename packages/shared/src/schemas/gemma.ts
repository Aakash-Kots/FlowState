/**
 * Runtime validation for the Ask-Gemma domain. Mirrors `../types/gemma`.
 */
import { z } from 'zod';
import { GemmaStreamKind } from '../enums/gemma';
import type { GemmaStreamEvent } from '../types/gemma';

export const gemmaStreamEventSchema: z.ZodType<GemmaStreamEvent> = z.object({
  kind: z.nativeEnum(GemmaStreamKind),
  text: z.string(),
});
