'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { Prec, type Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { githubDark } from '@uiw/codemirror-theme-github';
import { Eye, FileCode } from 'lucide-react';
import type { Tab } from '@flowstate/shared';
import {
  clearFileTabDirty,
  isMarkdownPath,
  setFileTabDirty,
  toggleFileTabPreview,
  useFileTabDirty,
  useFileTabPreview,
} from '@/lib/fileTabs';
import { trpc } from '@/lib/trpc';
import { Markdown } from '../chat/Markdown';

/////////////
// Helpers //
/////////////

/** CodeMirror language extension(s) for a file path, or none when unsupported. */
function languageExtension(path: string): Extension[] {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
      return [javascript({ typescript: true })];
    case 'tsx':
      return [javascript({ typescript: true, jsx: true })];
    case 'jsx':
      return [javascript({ jsx: true })];
    case 'js':
    case 'mjs':
    case 'cjs':
      return [javascript()];
    case 'json':
      return [json()];
    case 'py':
      return [python()];
    case 'md':
    case 'markdown':
      return [markdown()];
    default:
      return [];
  }
}

/////////////
// Component //
/////////////

/**
 * A file tab's body: loads the worktree file over tRPC, renders it in a
 * CodeMirror editor, and saves back to disk on ⌘S. The dirty flag is mirrored
 * into the shared `fileTabs` store so the tab strip can show an unsaved dot.
 */
export function FileEditor({ tab }: { tab: Tab }) {
  const { id: tabId, workspaceId } = tab;
  const path = tab.filePath ?? '';
  const dirty = useFileTabDirty(tabId);
  const isMarkdown = isMarkdownPath(path);
  const showPreview = useFileTabPreview(tabId) && isMarkdown;

  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The last-persisted contents + the latest editor value, for the ⌘S closure.
  const savedRef = useRef('');
  const latestRef = useRef('');

  // Load (and reload when the path changes). Cancels a stale load on switch.
  useEffect(() => {
    if (!path) {
      setError('This file tab has no path.');
      return;
    }
    let cancelled = false;
    setValue(null);
    setError(null);
    trpc()
      .files.read.query({ workspaceId, path })
      .then((res) => {
        if (cancelled) return;
        savedRef.current = res.content;
        latestRef.current = res.content;
        setValue(res.content);
        clearFileTabDirty(tabId);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to open file.');
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, path, tabId]);

  const save = useCallback(() => {
    const content = latestRef.current;
    if (content === savedRef.current) return;
    setSaving(true);
    setError(null);
    trpc()
      .files.write.mutate({ workspaceId, path, content })
      .then(() => {
        savedRef.current = content;
        clearFileTabDirty(tabId);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to save file.'))
      .finally(() => setSaving(false));
  }, [workspaceId, path, tabId]);

  // Keep the ⌘S binding stable while always calling the freshest `save`.
  const saveRef = useRef(save);
  saveRef.current = save;

  const extensions = useMemo<Extension[]>(
    () => [
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              saveRef.current();
              return true;
            },
          },
        ]),
      ),
      EditorView.lineWrapping,
      ...languageExtension(path),
    ],
    [path],
  );

  const onChange = useCallback(
    (next: string) => {
      latestRef.current = next;
      setValue(next);
      setFileTabDirty(tabId, next !== savedRef.current);
    },
    [tabId],
  );

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (value === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
        <span className="truncate font-mono text-muted-foreground">{path}</span>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {isMarkdown && (
            <button
              type="button"
              onClick={() => toggleFileTabPreview(tabId)}
              title={showPreview ? 'Show source (⌘⇧P)' : 'Show preview (⌘⇧P)'}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {showPreview ? <FileCode className="size-3.5" /> : <Eye className="size-3.5" />}
              {showPreview ? 'Source' : 'Preview'}
            </button>
          )}
          <span className="text-muted-foreground">
            {saving ? 'Saving…' : dirty ? 'Unsaved — ⌘S to save' : 'Saved'}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {showPreview ? (
          <div className="mx-auto max-w-3xl px-6 py-5">
            <Markdown>{value}</Markdown>
          </div>
        ) : (
          <CodeMirror
            value={value}
            onChange={onChange}
            extensions={extensions}
            theme={githubDark}
            height="100%"
            className="h-full text-sm"
          />
        )}
      </div>
    </div>
  );
}
