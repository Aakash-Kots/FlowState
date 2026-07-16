/**
 * System-metrics sampling constants (main-process only — they drive a local
 * `systeminformation` sampler and never cross into shared).
 */

/** How often the header widget re-samples CPU / RAM / swap while subscribed (ms). */
export const SYSTEM_METRICS_POLL_INTERVAL_MS = 2000;
