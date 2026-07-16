/**
 * Runtime validation for the pinned Skills & Actions domain. Mirrors
 * `../types/skills`; the store re-`parse()`es rows on read so the DB can never
 * hand back a malformed PinnedItem.
 */
import { z } from 'zod';
import { PinnedItemKind, SkillImportOrigin } from '../enums/skills';
import type { ImportableSkill, PinnedItem } from '../types/skills';

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

export const importableSkillSchema: z.ZodType<ImportableSkill> = z.object({
  name: z.string(),
  description: z.string().nullable(),
  sourcePath: z.string(),
  origin: z.nativeEnum(SkillImportOrigin),
  sourceLabel: z.string(),
});
