'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { FontSize } from '@flowstate/shared';
import { CODE_THEMES } from '@/lib/constants/codeThemes';
import {
  setCodeTheme,
  setFontSize,
  setSettingsOpen,
  setSoundEnabled,
  useSettings,
} from '@/lib/settings';
import { cn } from '../ui/cn';
import { ArchiveRetentionCard } from './ArchiveRetentionCard';
import { CodeThemeCard } from './CodeThemeCard';

///////////////
// Constants //
///////////////

/** The text-size choices, ascending, with their user-facing labels. */
const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: FontSize.Small, label: 'Small' },
  { value: FontSize.Default, label: 'Default' },
  { value: FontSize.Large, label: 'Large' },
  { value: FontSize.ExtraLarge, label: 'Extra Large' },
];

///////////////////
// Sub-components //
///////////////////

/** A segmented button group for picking the base UI text size. */
function FontSizeControl({
  value,
  onChange,
}: {
  value: FontSize;
  onChange: (v: FontSize) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {FONT_SIZE_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded px-3 py-1 text-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A pill toggle switch for a boolean setting. */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'inline-block size-4 rounded-full bg-background shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/**
 * One settings row: a title + description on the left and its control on the
 * right. `stack` drops the control onto its own full-width line below the label
 * for wide controls (the theme grid).
 */
function SettingRow({
  title,
  description,
  control,
  stack = false,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
  stack?: boolean;
}) {
  return (
    <div
      className={cn('px-4 py-3.5', stack ? 'space-y-3' : 'flex items-center justify-between gap-6')}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className={cn(stack ? '' : 'shrink-0')}>{control}</div>
    </div>
  );
}

/** A titled group of rows in a bordered card. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {children}
      </div>
    </section>
  );
}

/////////////////
// Settings page //
/////////////////

/**
 * The full-screen Settings surface, rendered in place of the workspace body when
 * `settingsOpen`. Row-by-row preferences grouped into cards; closes on Esc or the
 * header ✕. All settings persist through the settings store.
 */
export function SettingsPage() {
  const soundEnabled = useSettings((s) => s.soundEnabled);
  const codeTheme = useSettings((s) => s.codeTheme);
  const fontSize = useSettings((s) => s.fontSize);

  // Esc closes the page — a familiar exit for a modal-like full surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-sm font-semibold text-foreground">Settings</h1>
        <button
          type="button"
          onClick={() => setSettingsOpen(false)}
          title="Close settings"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
          <span className="sr-only">Close settings</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-8">
          <Section title="Appearance">
            <SettingRow
              stack
              title="Text size"
              description="Scale the whole interface up or down."
              control={
                <div className="space-y-3">
                  <FontSizeControl value={fontSize} onChange={setFontSize} />
                  <p className="text-sm text-muted-foreground">
                    The quick brown fox jumps over the lazy dog.
                  </p>
                </div>
              }
            />
            <SettingRow
              stack
              title="Code theme"
              description="Syntax-highlighting palette for git diffs and chat code blocks."
              control={
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {CODE_THEMES.map((theme) => (
                    <CodeThemeCard
                      key={theme.id}
                      theme={theme}
                      selected={theme.id === codeTheme}
                      onSelect={() => setCodeTheme(theme.id)}
                    />
                  ))}
                </div>
              }
            />
          </Section>

          <Section title="Notifications">
            <SettingRow
              title="Completion sound"
              description="Play a sound when an agent finishes a turn in a tab you're not watching."
              control={
                <Toggle
                  checked={soundEnabled}
                  onChange={setSoundEnabled}
                  label="Completion sound"
                />
              }
            />
          </Section>

          <Section title="Worktrees">
            <SettingRow
              title="Delete archived worktrees"
              description="When to remove an archived worktree from disk after its PR is merged."
              control={<ArchiveRetentionCard />}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
