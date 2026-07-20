'use client';

import { useState } from 'react';
import { Check, Loader2, Trash2 } from 'lucide-react';
import { clearGeminiApiKey, setGeminiApiKey, useSettings } from '@/lib/settings';
import { cn } from '../ui/cn';
import { Button } from '../ui/Button';

/**
 * The Gemini API-key control: a password field to paste a key (encrypted via
 * safeStorage in the main process — the plaintext never comes back), plus a
 * connected state with a Clear button. Powers Ask Gemini, ticket refinement, and
 * speech-to-text. Modeled on the GitHub PAT input in `ConnectScreen`.
 */
export function GeminiApiKeyCard() {
  const connected = useSettings((s) => s.geminiApiKeySet);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setBusy('save');
    setError(null);
    try {
      await setGeminiApiKey(trimmed);
      setKey('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the key.');
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    setBusy('clear');
    setError(null);
    try {
      await clearGeminiApiKey();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear the key.');
    } finally {
      setBusy(null);
    }
  };

  if (connected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
        <p className="flex items-center gap-1.5 text-sm text-neutral-200">
          <Check className="size-3.5 text-success" />
          API key connected
        </p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void clear()}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-neutral-100',
            busy !== null && 'cursor-not-allowed opacity-60',
          )}
        >
          {busy === 'clear' ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          Clear
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
          placeholder="AIza…"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
        />
        <Button variant="secondary" onClick={() => void save()} disabled={!key.trim() || busy !== null}>
          {busy === 'save' ? <Loader2 className="size-3.5 animate-spin" /> : 'Save'}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Get a key from{' '}
        <span className="text-neutral-300">Google AI Studio</span>. It&apos;s encrypted with your OS
        keychain — only ciphertext is written to disk.
      </p>
    </div>
  );
}
