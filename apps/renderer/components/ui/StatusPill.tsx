'use client';

import { ConnStatus } from '@/lib/enums/connection';
import { cn } from './cn';

const STYLES: Record<ConnStatus, { dot: string; text: string; label: string }> = {
  [ConnStatus.Connected]: { dot: 'bg-success', text: 'text-success', label: 'Connected' },
  [ConnStatus.Pending]: { dot: 'bg-warn animate-pulse', text: 'text-warn', label: 'Waiting…' },
  [ConnStatus.Error]: { dot: 'bg-danger', text: 'text-danger', label: 'Error' },
  [ConnStatus.Idle]: {
    dot: 'bg-muted-foreground',
    text: 'text-muted-foreground',
    label: 'Not connected',
  },
};

export function StatusPill({ status, label }: { status: ConnStatus; label?: string }) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium',
        s.text,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {label ?? s.label}
    </span>
  );
}
