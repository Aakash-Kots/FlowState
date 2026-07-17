'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';
import { DropdownMenu } from './dropdown-menu';

///////////
// Types //
///////////

// Presentational props — intentionally string-literal unions, not enums (conventions §4).
type Align = 'start' | 'end';
type Placement = 'top' | 'bottom';

/** An optional "clear the selection" row pinned above the results (e.g. "No issue"). */
type ClearOption = {
  label: ReactNode;
  /** Whether the picker currently has nothing selected (highlights the row). */
  active: boolean;
  onClear: () => void;
};

type ComboboxProps<T> = {
  /** Rendered inside the trigger button. */
  trigger: ReactNode;
  triggerClassName?: string;
  panelClassName?: string;
  align?: Align;
  placement?: Placement;
  disabled?: boolean;
  /** The selectable rows. */
  items: T[];
  /** Stable React key for an item. */
  getKey: (item: T) => string;
  /** Text matched (case-insensitively, as a substring) against the query. */
  getFilterText: (item: T) => string;
  /** Row body; `selected` reflects the current value. */
  renderItem: (item: T, selected: boolean) => ReactNode;
  /** Whether an item is the current selection (for highlight state). */
  isSelected?: (item: T) => boolean;
  onSelect: (item: T) => void;
  /** Search-input placeholder. */
  placeholder?: string;
  /** Shown when there are no items at all (not merely no matches). */
  emptyText?: ReactNode;
  /** Show a spinner in the search box (e.g. while (re)fetching). */
  loading?: boolean;
  /** Called when the panel opens (e.g. to refresh data). */
  onOpen?: () => void;
  /** Optional clear row pinned above the results. */
  clear?: ClearOption;
};

////////////
// Export //
////////////

/**
 * A searchable select built on `DropdownMenu`: a trigger plus a panel with a
 * filter input and a scrollable, keyboard-navigable list. Extracted from the
 * create-worktree modal's Linear picker so the base-branch picker (and future
 * pickers) share one look and behavior. Filtering is local; `onOpen` lets the
 * caller refresh the source on each open.
 */
export function Combobox<T>({
  trigger,
  triggerClassName,
  panelClassName,
  align,
  placement,
  disabled,
  items,
  getKey,
  getFilterText,
  renderItem,
  isSelected,
  onSelect,
  placeholder = 'Search…',
  emptyText = 'No results',
  loading,
  onOpen,
  clear,
}: ComboboxProps<T>) {
  return (
    <DropdownMenu
      align={align}
      placement={placement}
      panelClassName={cn('bg-background', panelClassName)}
      disabled={disabled}
      triggerClassName={triggerClassName}
      onOpenChange={(open) => {
        if (open) onOpen?.();
      }}
      trigger={trigger}
    >
      {(close) => (
        <ComboboxPanel
          placement={placement}
          items={items}
          getKey={getKey}
          getFilterText={getFilterText}
          renderItem={renderItem}
          isSelected={isSelected}
          placeholder={placeholder}
          emptyText={emptyText}
          loading={loading}
          clear={clear}
          onSelect={(item) => {
            onSelect(item);
            close();
          }}
          onClear={
            clear
              ? () => {
                  clear.onClear();
                  close();
                }
              : undefined
          }
        />
      )}
    </DropdownMenu>
  );
}

/////////////
// Internal //
/////////////

/**
 * The panel body — remounted on each open (so its query/highlight reset for
 * free), which is why the search input can `autoFocus`.
 */
function ComboboxPanel<T>({
  placement,
  items,
  getKey,
  getFilterText,
  renderItem,
  isSelected,
  placeholder,
  emptyText,
  loading,
  clear,
  onSelect,
  onClear,
}: {
  placement?: Placement;
  items: T[];
  getKey: (item: T) => string;
  getFilterText: (item: T) => string;
  renderItem: (item: T, selected: boolean) => ReactNode;
  isSelected?: (item: T) => boolean;
  placeholder: string;
  emptyText: ReactNode;
  loading?: boolean;
  clear?: ClearOption;
  onSelect: (item: T) => void;
  onClear?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? items.filter((it) => getFilterText(it).toLowerCase().includes(q)) : items),
    [q, items, getFilterText],
  );
  const activeIndex = Math.min(active, Math.max(0, filtered.length - 1));

  const move = (delta: number) => {
    if (filtered.length === 0) return;
    setActive((i) => {
      const next = (i + delta + filtered.length) % filtered.length;
      listRef.current
        ?.querySelector(`[data-index="${next}"]`)
        ?.scrollIntoView({ block: 'nearest' });
      return next;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) onSelect(item);
    }
  };

  // The panel opens upward for `top` placement (the default), so put the search
  // input on the edge nearest the trigger — the bottom — keeping it on-screen even
  // when a long list would otherwise push it (and the panel's top) off the viewport.
  // Only the scrollable list can then be clipped, and it scrolls.
  const searchAtBottom = (placement ?? 'top') === 'top';

  const searchInput = (
    <div className={cn('relative', searchAtBottom ? 'mt-1' : 'mb-1')}>
      <input
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        className="h-7 w-full rounded-md border border-border bg-background pl-2 pr-7 text-xs text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
      />
      {loading ? (
        <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );

  return (
    <div className="flex w-72 flex-col">
      {searchAtBottom ? null : searchInput}
      <div ref={listRef} className="max-h-56 overflow-y-auto">
        {onClear && clear ? (
          <button
            type="button"
            onClick={onClear}
            className={cn(
              'flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
              clear.active ? 'text-neutral-100' : 'text-muted-foreground',
            )}
          >
            {clear.label}
          </button>
        ) : null}
        {filtered.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </>
            ) : (
              <span>{query ? 'No matches' : emptyText}</span>
            )}
          </div>
        ) : (
          filtered.map((item, index) => {
            const selected = isSelected?.(item) ?? false;
            return (
              <button
                key={getKey(item)}
                type="button"
                data-index={index}
                onMouseEnter={() => setActive(index)}
                onClick={() => onSelect(item)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                  index === activeIndex ? 'bg-accent' : 'hover:bg-accent/60',
                  selected ? 'text-neutral-100' : 'text-neutral-200',
                )}
              >
                {renderItem(item, selected)}
              </button>
            );
          })
        )}
      </div>
      {searchAtBottom ? searchInput : null}
    </div>
  );
}
