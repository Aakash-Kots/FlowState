'use client';

import { ChevronDown } from 'lucide-react';
import { CURATED_MODELS, DEFAULT_EFFORT, DEFAULT_MODEL, ReasoningEffort } from '@flowstate/shared';
import { setEffort, setModel, useChat, useTabId } from '@/lib/chat';
import { DropdownItem, DropdownMenu } from '../ui/dropdown-menu';

///////////////
// Constants //
///////////////

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  [ReasoningEffort.Low]: 'Low',
  [ReasoningEffort.Medium]: 'Medium',
  [ReasoningEffort.High]: 'High',
  [ReasoningEffort.XHigh]: 'Extra high',
  [ReasoningEffort.Max]: 'Max',
};

// The models offered in the picker are hardcoded (see @flowstate/shared) so the
// list is always the full set regardless of what the SDK reports for a session.
const MODELS = CURATED_MODELS;

/**
 * Compact model + reasoning-effort pickers that sit below the textarea inside
 * the floating input card. The model list is fixed; the effort options are
 * gated by the selected model's supported levels.
 */
export function InputToolbar({ disabled }: { disabled: boolean }) {
  const tabId = useTabId();
  // Fall back to the defaults so the picker always shows a concrete model +
  // effort (Opus 4.8 / High) until the user changes it.
  const model = useChat((s) => s.model) ?? DEFAULT_MODEL;
  const effort = useChat((s) => s.effort) ?? DEFAULT_EFFORT;
  const models = MODELS;

  const current = models.find((m) => m.value === model);
  const modelLabel = current?.displayName ?? model;
  const effortLevels = current?.supportedEffortLevels ?? [];
  const effortEnabled = !disabled && (current?.supportsEffort ?? false);
  const effortLabel = EFFORT_LABELS[effort];

  const triggerClass = 'px-2 py-1 text-muted-foreground hover:bg-raised hover:text-neutral-100';

  return (
    <div className="flex items-center gap-1 px-1.5 pb-1.5 pt-1">
      <DropdownMenu
        disabled={disabled}
        triggerClassName={triggerClass}
        trigger={
          <>
            <span className="max-w-[10rem] truncate">{modelLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </>
        }
      >
        {(close) =>
          models.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">Loading models…</div>
          ) : (
            models.map((m) => (
              <DropdownItem
                key={m.value}
                selected={m.value === model}
                onSelect={() => {
                  setModel(tabId, m.value);
                  close();
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{m.displayName}</span>
                  {m.description && (
                    <span className="text-[11px] leading-snug text-muted-foreground">
                      {m.description}
                    </span>
                  )}
                </div>
              </DropdownItem>
            ))
          )
        }
      </DropdownMenu>

      <span className="text-edge">·</span>

      <DropdownMenu
        disabled={!effortEnabled}
        triggerClassName={triggerClass}
        trigger={
          <>
            <span>{effortLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </>
        }
      >
        {(close) =>
          effortLevels.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">
              This model has no effort levels.
            </div>
          ) : (
            effortLevels.map((level) => (
              <DropdownItem
                key={level}
                selected={level === effort}
                onSelect={() => {
                  setEffort(tabId, level);
                  close();
                }}
              >
                {EFFORT_LABELS[level]}
              </DropdownItem>
            ))
          )
        }
      </DropdownMenu>
    </div>
  );
}
