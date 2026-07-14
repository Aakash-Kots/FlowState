'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { CODE_THEMES } from '@/lib/constants/codeThemes';
import { setCodeTheme, setSettingsOpen, setSoundEnabled, useSettings } from '@/lib/settings';
import { cn } from '../ui/cn';
import { ArchiveRetentionCard } from './ArchiveRetentionCard';
import { CodeThemeCard } from './CodeThemeCard';

///////////////////
// Sub-components //
///////////////////

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
              description="Play a sound when a background agent finishes a turn."
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
