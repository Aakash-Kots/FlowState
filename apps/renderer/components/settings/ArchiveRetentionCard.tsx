'use client';

import { ArchiveRetention } from '@flowstate/shared';
import { setArchiveRetention, useSettings } from '@/lib/settings';

///////////////
// Constants //
///////////////

/** Human labels for each retention choice, in ascending order. */
const OPTIONS: { value: ArchiveRetention; label: string }[] = [
  { value: ArchiveRetention.Immediately, label: 'Immediately' },
  { value: ArchiveRetention.OneHour, label: 'After 1 hour' },
  { value: ArchiveRetention.OneDay, label: 'After 24 hours' },
  { value: ArchiveRetention.SevenDays, label: 'After 7 days' },
];

const SELECT_CLASS =
  'h-9 rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/60';

/////////////////
// Component //
/////////////////

/**
 * Picks how long an archived worktree lingers on disk before the background
 * reaper deletes it. Persists (optimistically) through the settings store.
 */
export function ArchiveRetentionCard() {
  const archiveRetention = useSettings((s) => s.archiveRetention);

  return (
    <select
      aria-label="Archived worktree retention"
      value={archiveRetention}
      onChange={(e) => setArchiveRetention(e.target.value as ArchiveRetention)}
      className={SELECT_CLASS}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
