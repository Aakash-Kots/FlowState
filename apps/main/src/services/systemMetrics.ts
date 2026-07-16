/**
 * SystemMetricsService — samples the machine's own CPU / RAM / swap utilization
 * (via `systeminformation`) and fans the snapshots out to the header widget.
 *
 * Sampling is ref-counted: the first subscriber starts the interval, the last
 * one to leave tears it down, so no timer runs while nothing is watching (the
 * widget is the only consumer). RAM is reported as *pressure* — derived from the
 * OS "available" figure, which counts reclaimable file cache as free — so on
 * macOS it reflects real memory pressure instead of pinning near 100%. GPU
 * utilization is best-effort: null unless a controller reports a live number
 * (usually unavailable on macOS / Apple Silicon).
 */
import { EventEmitter } from 'node:events';
import si from 'systeminformation';
import type { SystemMetrics } from '@flowstate/shared';
import { SYSTEM_METRICS_POLL_INTERVAL_MS } from '../lib/constants/system';

///////////////
// Constants //
///////////////

const METRICS_EVENT = 'metrics';

/////////////
// Helpers //
/////////////

/** Clamp a raw percentage into the 0-100 range the meters expect. */
function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

/**
 * First GPU controller reporting a live utilization %, else null. On macOS /
 * Apple Silicon `utilizationGpu` is typically absent, so the widget's GPU row
 * self-hides — that's expected, not an error.
 */
function pickGpuUtilization(graphics: si.Systeminformation.GraphicsData | null): number | null {
  if (!graphics) return null;
  for (const c of graphics.controllers) {
    if (typeof c.utilizationGpu === 'number' && Number.isFinite(c.utilizationGpu)) {
      return c.utilizationGpu;
    }
  }
  return null;
}

//////////////////////////
// SystemMetricsService //
//////////////////////////

class SystemMetricsService {
  private readonly events = new EventEmitter();
  private timer: ReturnType<typeof setInterval> | null = null;
  private refCount = 0;
  private sampling = false;
  private latest: SystemMetrics | null = null;

  /** Most recent sample, or null before the first tick lands. */
  getSnapshot(): SystemMetrics | null {
    return this.latest;
  }

  /**
   * Subscribe to resource samples; returns an unsubscribe. The first subscriber
   * starts the sampler (with one immediate sample), the last stops it.
   */
  onMetrics(listener: (metrics: SystemMetrics) => void): () => void {
    this.events.on(METRICS_EVENT, listener);
    this.acquire();
    return () => {
      this.events.off(METRICS_EVENT, listener);
      this.release();
    };
  }

  private acquire(): void {
    this.refCount += 1;
    if (this.timer) return;
    void this.sample();
    this.timer = setInterval(() => void this.sample(), SYSTEM_METRICS_POLL_INTERVAL_MS);
  }

  private release(): void {
    this.refCount -= 1;
    if (this.refCount > 0) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Take one sample, cache it, and emit. Re-entrancy-guarded so a slow sample
   * (systeminformation shells out) never overlaps the next tick. */
  private async sample(): Promise<void> {
    if (this.sampling) return;
    this.sampling = true;
    try {
      const [mem, load, graphics] = await Promise.all([
        si.mem(),
        si.currentLoad(),
        si.graphics().catch(() => null),
      ]);

      const ramUsedBytes = Math.max(0, mem.total - mem.available);
      const ramPct = mem.total > 0 ? (ramUsedBytes / mem.total) * 100 : 0;
      const swapPct = mem.swaptotal > 0 ? (mem.swapused / mem.swaptotal) * 100 : null;
      const gpuPct = pickGpuUtilization(graphics);

      const metrics: SystemMetrics = {
        ramPct: clampPct(ramPct),
        swapPct: swapPct === null ? null : clampPct(swapPct),
        cpuPct: clampPct(load.currentLoad),
        gpuPct: gpuPct === null ? null : clampPct(gpuPct),
        ramUsedBytes,
        ramTotalBytes: mem.total,
        swapUsedBytes: mem.swapused,
      };

      this.latest = metrics;
      this.events.emit(METRICS_EVENT, metrics);
    } catch (err) {
      console.warn('[systemMetrics] sample failed', err);
    } finally {
      this.sampling = false;
    }
  }
}

/** App-wide singleton — sampled on demand by the `system` router's subscription. */
export const systemMetricsService = new SystemMetricsService();
