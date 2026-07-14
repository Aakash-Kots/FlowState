/**
 * Runtime validation for the pinned Skills & Actions domain. Mirrors
 * `../types/skills`; the store re-`parse()`es rows on read so the DB can never
 * hand back a malformed PinnedItem.
 */
import { z } from 'zod';
import { PinnedItemKind } from '../enums/skills';
import type { PinnedItem } from '../types/skills';

export const pinnedItemSchema: z.ZodType<PinnedItem> = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  kind: z.nativeEnum(PinnedItemKind),
  ref: z.string(),
  label: z.string(),
  position: z.number(),
  createdAt: z.string().datetime(),
});
