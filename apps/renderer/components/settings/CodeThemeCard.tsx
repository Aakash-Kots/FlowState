'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { CodeThemeMeta } from '@/lib/types/settings';
import { CODE_THEME_PREVIEW } from '@/lib/constants/codeThemes';
import { highlightToHtml } from '@/lib/highlight';
import { cn } from '../ui/cn';

/**
 * A selectable swatch for one code theme. Renders the shared preview snippet
 * highlighted inside its own `data-code-theme` scope, so each card shows exactly
 * how that palette colors real code — the picker doubles as a live preview.
 */
export function CodeThemeCard({
  theme,
  selected,
  onSelect,
}: {
  theme: CodeThemeMeta;
  selected: boolean;
  onSelect: () => void;
}) {
  const html = useMemo(() => highlightToHtml(CODE_THEME_PREVIEW, 'typescript') ?? '', []);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={theme.label}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border text-left transition-colors',
        selected
          ? 'border-primary ring-1 ring-primary'
          : 'border-border hover:border-muted-foreground/40',
      )}
    >
      <div
        data-code-theme={theme.id}
        className="code-hl overflow-hidden px-3 py-2.5"
        style={{ backgroundColor: 'var(--code-bg)' }}
      >
        <pre className="pointer-events-none font-mono text-[10px] leading-[1.5]">
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-3 py-2">
        <span className="truncate text-xs font-medium text-foreground">{theme.label}</span>
        {selected ? (
          <Check className="size-3.5 shrink-0 text-primary" />
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {theme.appearance}
          </span>
        )}
      </div>
    </button>
  );
}
