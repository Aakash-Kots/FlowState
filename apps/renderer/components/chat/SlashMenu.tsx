'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { SkillOption } from '@flowstate/shared';
import { cn } from '../ui/cn';

/**
 * The `/`-triggered skill autocomplete that floats above the composer. Purely
 * presentational: the composer owns the filter query, the highlighted index, and
 * all keyboard handling (Arrow/Enter/Tab/Escape); this just renders the list (or
 * a loading state while the session boots) and reports clicks/hovers back up.
 */
export function SlashMenu({
  skills,
  activeIndex,
  loading,
  onSelect,
  onHover,
}: {
  skills: SkillOption[];
  activeIndex: number;
  loading?: boolean;
  onSelect: (skill: SkillOption) => void;
  onHover: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the highlighted row scrolled into view as the user arrows through.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div className="absolute inset-x-0 bottom-full z-50 mb-2">
      <div
        ref={listRef}
        className="max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
      >
        <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Skills
        </div>
        {loading && (
          <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading skills…
          </div>
        )}
        {skills.map((skill, index) => (
          <button
            key={skill.name}
            type="button"
            data-index={index}
            // mousedown (not click) + preventDefault keeps textarea focus so the
            // blur doesn't dismiss the menu before the selection registers.
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(skill);
            }}
            onMouseEnter={() => onHover(index)}
            className={cn(
              'flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left transition-colors',
              index === activeIndex ? 'bg-accent' : 'hover:bg-accent/60',
            )}
          >
            <span className="flex items-center gap-1.5 text-xs text-popover-foreground">
              <span className="font-medium">/{skill.name}</span>
              {skill.argumentHint && (
                <span className="text-muted-foreground">{skill.argumentHint}</span>
              )}
            </span>
            {skill.description && (
              <span className="line-clamp-1 text-[11px] leading-snug text-muted-foreground">
                {skill.description}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
