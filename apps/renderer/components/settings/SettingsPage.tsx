'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { FontSize } from '@flowstate/shared';
import { CODE_THEMES } from '@/lib/constants/codeThemes';
import {
  setCodeTheme,
  setFontSize,
  setPreferSmallModel,
  setSemanticSearchEnabled,
  setSettingsOpen,
  setSoundEnabled,
  useSettings,
} from '@/lib/settings';
import { cn } from '../ui/cn';
import { ArchiveRetentionCard } from './ArchiveRetentionCard';
import { CodeThemeCard } from './CodeThemeCard';
import { Section, SettingRow } from './SettingsLayout';
import { SmartSearchModelCard } from './SmartSearchModelCard';

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
  const semanticSearchEnabled = useSettings((s) => s.semanticSearchEnabled);
  const preferSmallModel = useSettings((s) => s.preferSmallModel);

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

          <Section title="Search">
            <SettingRow
              title="Natural-language search"
              description="Describe a ticket in plain language and rank Linear results by meaning — computed on-device. When off, search stays literal (identifier + title)."
              control={
                <Toggle
                  checked={semanticSearchEnabled}
                  onChange={setSemanticSearchEnabled}
                  label="Natural-language search"
                />
              }
            />
            <SettingRow
              title="Use smaller model"
              description="Force the smaller Q4 model regardless of memory — about 80 MB less disk and lower memory use, with slightly lower recall."
              control={
                <Toggle
                  checked={preferSmallModel}
                  onChange={setPreferSmallModel}
                  label="Use smaller model"
                />
              }
            />
            <SettingRow
              stack
              title="On-device model"
              description="The EmbeddingGemma weights are downloaded once and shared across every workspace. Delete to reclaim the space; it re-downloads next time you search."
              control={<SmartSearchModelCard endpoint="search" />}
            />
          </Section>

          <Section title="Ask Gemma">
            <SettingRow
              stack
              title="On-device assistant"
              description="Double-tap Space anywhere to ask a local Gemma 3 model and get a streamed answer inline. The model size is chosen from your available memory; it downloads once on first use."
              control={<SmartSearchModelCard endpoint="gemma" />}
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
