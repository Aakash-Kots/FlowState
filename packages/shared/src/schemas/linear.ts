/**
 * Runtime validation for the Linear domain. Mirrors `../types/linear`.
 */
import { z } from 'zod';
import type { LinearIssueRef } from '../types/linear';

export const linearIssueRefSchema: z.ZodType<LinearIssueRef> = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  url: z.string().url(),
  stateName: z.string().optional(),
});
