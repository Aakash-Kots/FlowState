/**
 * Runtime validation for the header notes domain. Mirrors `../types/notes`; the
 * store re-`parse()`es rows on read so the DB can never hand back a malformed Note.
 */
import { z } from 'zod';
import type { Note } from '../types/notes';

export const noteSchema: z.ZodType<Note> = z.object({
  id: z.string(),
  workspaceId: z.string().nullable(),
  body: z.string(),
  updatedAt: z.string().datetime(),
});
