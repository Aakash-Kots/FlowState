'use client';

import { useState } from 'react';
import { Terminal } from 'lucide-react';
import { TerminalKind, type Project } from '@flowstate/shared';
import { saveProjectScripts } from '@/lib/projects';
import { Button } from '../ui/Button';
import { Input } from '../ui/input';

///////////////
// Constants //
///////////////

const COPY: Record<
  TerminalKind.Setup | TerminalKind.Run,
  { title: string; hint: string; placeholder: string }
> = {
  [TerminalKind.Setup]: {
    title: 'Set a setup command',
    hint: 'Runs in every new worktree of this project (e.g. installing dependencies).',
    placeholder: 'bun install',
  },
  [TerminalKind.Run]: {
    title: 'Set a run command',
    hint: 'Runs this project (e.g. your dev server). Shared by all its worktrees.',
    placeholder: 'bun run dev',
  },
};

/**
 * Inline configuration shown in a Setup/Run terminal tab whose project script
 * isn't set yet. Saves the command to the project (shared by every worktree);
 * once set, the tab renders the live terminal instead.
 */
export function ScriptSetupTab({
  project,
  kind,
}: {
  project: Project;
  kind: TerminalKind.Setup | TerminalKind.Run;
}) {
  const copy = COPY[kind];
  const [command, setCommand] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const value = command.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      await saveProjectScripts(project.id, {
        setupScript: kind === TerminalKind.Setup ? value : project.setupScript,
        runScript: kind === TerminalKind.Run ? value : project.runScript,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-secondary p-6">
      <div className="w-full max-w-md space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Terminal className="size-4 text-muted-foreground" />
          {copy.title}
        </div>
        <p className="text-xs text-muted-foreground">{copy.hint}</p>
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
            }}
            placeholder={copy.placeholder}
            className="font-mono"
          />
          <Button onClick={() => void save()} disabled={!command.trim() || saving}>
            {saving ? 'Saving…' : 'Save & run'}
          </Button>
        </div>
      </div>
    </div>
  );
}
