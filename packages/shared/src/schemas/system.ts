/**
 * Runtime validation for the live system-metrics snapshot. Mirrors
 * `../types/system`; `.parse()`d at the router boundary before a sample leaves
 * the main process.
 */
import { z } from 'zod';
import type { SystemMetrics } from '../types/system';

/** Validates one system-resource sample at the IPC boundary. */
export const systemMetricsSchema: z.ZodType<SystemMetrics> = z.object({
  ramPct: z.number(),
  swapPct: z.number().nullable(),
  cpuPct: z.number(),
  gpuPct: z.number().nullable(),
  ramUsedBytes: z.number(),
  ramTotalBytes: z.number(),
  swapUsedBytes: z.number(),
});
