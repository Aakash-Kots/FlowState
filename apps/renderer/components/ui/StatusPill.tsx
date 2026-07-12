'use client';

import { cn } from './cn';

export type ConnStatus = 'connected' | 'pending' | 'error' | 'idle';

const STYLES: Record<ConnStatus, { dot: string; text: string; label: string }> = {
  connected: { dot: 'bg-success', text: 'text-success', label: 'Connected' },
  pending: { dot: 'bg-warn animate-pulse', text: 'text-warn', label: 'Waiting…' },
  error: { dot: 'bg-danger', text: 'text-danger', label: 'Error' },
  idle: { dot: 'bg-muted', text: 'text-muted', label: 'Not connected' },
};

export function StatusPill({ status, label }: { status: ConnStatus; label?: string }) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-edge bg-raised px-2.5 py-1 text-xs font-medium',
        s.text,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {label ?? s.label}
    </span>
  );
}
