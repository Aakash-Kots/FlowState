'use client';

import { Bell, BellOff } from 'lucide-react';
import { setSoundEnabled, useSettings } from '@/lib/settings';

/**
 * A compact header toggle for the agent-completion sound. Bell = on, BellOff =
 * muted. Persists through the settings store.
 */
export function SoundToggle() {
  const soundEnabled = useSettings((s) => s.soundEnabled);

  return (
    <button
      type="button"
      onClick={() => setSoundEnabled(!soundEnabled)}
      title={soundEnabled ? 'Mute completion sound' : 'Enable completion sound'}
      aria-pressed={soundEnabled}
      className="text-muted-foreground transition-colors hover:text-neutral-200"
    >
      {soundEnabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
    </button>
  );
}
