'use client';

/////////////
// Helpers //
/////////////

// A single shared AudioContext, created lazily on first ping. Browsers start it
// suspended until a user gesture, but by the time an agent finishes the user has
// long since interacted, so resume() resolves immediately.
let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/** Play one short note at `freq`, starting `at` seconds into the ping. */
function note(ac: AudioContext, freq: number, at: number, duration: number): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;

  const start = ac.currentTime + at;
  // Quick attack then exponential decay — a soft, non-jarring blip.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.2, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration);
}

/////////////////
// Ping export //
/////////////////

/** A short, pleasant two-note chime signalling an agent finished a turn. */
export function playPing(): void {
  try {
    const ac = audioContext();
    if (!ac) return;
    if (ac.state === 'suspended') void ac.resume();
    // A rising fifth (A5 → E6) — brief and cheerful.
    note(ac, 880, 0, 0.12);
    note(ac, 1318.5, 0.11, 0.16);
  } catch {
    // Audio is best-effort; never let it break the caller.
  }
}
