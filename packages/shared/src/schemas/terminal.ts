/**
 * Runtime validation for the terminal domain. Mirrors `../types/terminal`. The
 * `terminalTabSchema` has no defaults, so it is annotated `z.ZodType<TerminalTab>`
 * to stay in lockstep with the type; the store's `parse()`-and-return sites
 * (`terminals.ts`) enforce the output shape.
 */
import { z } from 'zod';
import { TerminalKind } from '../enums/terminal';
import type { CreateTerminalTabInput, TerminalTab } from '../types/terminal';

export const terminalTabSchema: z.ZodType<TerminalTab> = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  kind: z.nativeEnum(TerminalKind),
  command: z.string().nullable(),
  position: z.number().int(),
  createdAt: z.string().datetime(),
});

export const createTerminalTabInputSchema: z.ZodType<CreateTerminalTabInput> = z.object({
  workspaceId: z.string(),
  title: z.string().optional(),
});
