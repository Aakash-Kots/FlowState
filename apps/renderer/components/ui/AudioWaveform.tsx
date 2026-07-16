'use client';

import { cn } from './cn';

///////////
// Types //
///////////

type AudioWaveformProps = {
  /** Bars bounce while true; sit flat (frozen) when false. */
  playing: boolean;
  className?: string;
};

///////////////
// Constants //
///////////////

/** Per-bar animation offsets so the bars fall out of sync (equalizer look). */
const BARS: ReadonlyArray<{ delay: string; duration: string }> = [
  { delay: '0ms', duration: '0.9s' },
  { delay: '150ms', duration: '1.1s' },
  { delay: '300ms', duration: '0.8s' },
  { delay: '450ms', duration: '1s' },
];

/////////////////////
// AudioWaveform //
/////////////////////

/**
 * A small equalizer: a row of bars that bounce while `playing`, or sit flat
 * when paused. Decorative — not driven by real audio amplitude. Respects
 * `prefers-reduced-motion` (bars stay flat instead of animating).
 */
export function AudioWaveform({ playing, className }: AudioWaveformProps) {
  return (
    <div className={cn('flex h-4 items-end gap-0.5', className)} aria-hidden="true">
      {BARS.map((bar, i) => (
        <span
          key={i}
          className={cn(
            'w-0.5 origin-bottom rounded-full',
            playing
              ? 'h-full animate-equalize bg-[#1DB954] motion-reduce:h-1/3 motion-reduce:animate-none'
              : 'h-1/3 bg-muted-foreground',
          )}
          style={
            playing ? { animationDelay: bar.delay, animationDuration: bar.duration } : undefined
          }
        />
      ))}
    </div>
  );
}
