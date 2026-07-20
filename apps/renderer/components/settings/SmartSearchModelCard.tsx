'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { type ModelDiskInfo } from '@flowstate/shared';
import { trpc } from '@/lib/trpc';
import { cn } from '../ui/cn';

/////////////
// Helpers //
/////////////

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

////////////
// Export //
////////////

/**
 * The on-device embedding-model row: shows how much disk the downloaded weights
 * use and a Delete button to reclaim it. The weights re-download on demand the
 * next time the user runs a natural-language search.
 */
export function SmartSearchModelCard() {
  const [info, setInfo] = useState<ModelDiskInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = () =>
    trpc()
      .search.modelInfo.query()
      .then(setInfo)
      .catch(() => setInfo({ downloaded: false, bytes: 0 }));

  useEffect(() => {
    void refresh();
  }, []);

  const onDelete = async () => {
    setDeleting(true);
    try {
      setInfo(await trpc().search.deleteModel.mutate());
    } catch {
      await refresh();
    } finally {
      setDeleting(false);
    }
  };

  const downloaded = info?.downloaded ?? false;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
      <p className="text-sm">
        {downloaded ? (
          <>
            <span className="text-neutral-200">Model downloaded</span>
            <span className="text-muted-foreground"> · {formatBytes(info?.bytes ?? 0)} on disk</span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Not downloaded — fetched once (~300&nbsp;MB) the first time you search.
          </span>
        )}
      </p>
      <button
        type="button"
        disabled={!downloaded || deleting}
        onClick={() => void onDelete()}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors',
          downloaded && !deleting
            ? 'border-border text-muted-foreground hover:bg-muted hover:text-neutral-100'
            : 'cursor-not-allowed border-border/50 text-muted-foreground/40',
        )}
      >
        {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        Delete
      </button>
    </div>
  );
}
