/**
 * Live system-resource metrics for the header widget — the machine's own CPU /
 * RAM / swap utilization, sampled in the main process and streamed to the
 * renderer. Distinct from the Claude `usage` domain (subscription rate limits):
 * this is hardware pressure, surfaced so a user can see why the laptop is slow.
 * Runtime validation lives in `../schemas/system`.
 */

/**
 * One sampled snapshot of machine resource usage. Percentages are 0-100.
 *
 * `ramPct` is *pressure-based* — computed from the OS-reported "available"
 * memory (which counts reclaimable file cache as free), not raw `free`, so on
 * macOS it tracks real memory pressure instead of pinning near 100%. `swapPct`
 * is null when no swap is configured; `gpuPct` is null when the platform
 * reports no live GPU utilization (the usual case on macOS / Apple Silicon).
 * The `*Bytes` fields back the hover breakdown.
 */
export type SystemMetrics = {
  ramPct: number;
  swapPct: number | null;
  cpuPct: number;
  gpuPct: number | null;
  ramUsedBytes: number;
  ramTotalBytes: number;
  swapUsedBytes: number;
};
