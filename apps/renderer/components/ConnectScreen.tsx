'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConnStatus } from '@/lib/enums/connection';
import { trpc } from '@/lib/trpc';
import { useOnboarding } from '@/lib/onboarding';
import { Button } from './ui/Button';
import { Card, CardHeader } from './ui/Card';
import { StatusPill } from './ui/StatusPill';
import { TerminalView } from './TerminalView';

type Busy = null | 'claude' | 'github' | 'refresh' | 'pat';

export function ConnectScreen({ onClose }: { onClose?: () => void }) {
  const claudeConnected = useOnboarding((s) => s.claudeConnected);
  const githubConnected = useOnboarding((s) => s.githubConnected);

  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [hasGh, setHasGh] = useState<boolean | null>(null);
  const [showPat, setShowPat] = useState(false);
  const [pat, setPat] = useState('');
  const [busy, setBusy] = useState<Busy>(null);

  // Refresh live status when the screen mounts, and learn whether `gh` exists.
  useEffect(() => {
    void trpc()
      .onboarding.refresh.mutate()
      .catch(() => {});
    void trpc()
      .onboarding.githubHasCli.query()
      .then((v) => {
        setHasGh(v);
        if (!v) setShowPat(true);
      })
      .catch(() => setHasGh(false));
  }, []);

  const onSpawned = useCallback((id: string) => setTerminalId(id), []);

  const claudeLogin = async () => {
    if (!terminalId) return;
    setBusy('claude');
    try {
      await trpc().onboarding.claudeBeginLogin.mutate({ terminalId });
    } finally {
      setBusy(null);
    }
  };

  const githubLogin = async () => {
    if (!terminalId) return;
    setBusy('github');
    try {
      await trpc().onboarding.githubBeginLogin.mutate({ terminalId });
    } finally {
      setBusy(null);
    }
  };

  const submitPat = async () => {
    if (!pat.trim()) return;
    setBusy('pat');
    try {
      await trpc().onboarding.githubSetToken.mutate({ token: pat.trim() });
      setPat('');
    } finally {
      setBusy(null);
    }
  };

  const claudeLogout = async () => {
    if (!terminalId) return;
    setBusy('claude');
    try {
      await trpc().onboarding.claudeLogout.mutate({ terminalId });
    } finally {
      setBusy(null);
    }
  };

  const githubLogout = async () => {
    if (!terminalId) return;
    setBusy('github');
    try {
      await trpc().onboarding.githubLogout.mutate({ terminalId });
    } finally {
      setBusy(null);
    }
  };

  const recheck = async () => {
    setBusy('refresh');
    try {
      await trpc().onboarding.refresh.mutate();
    } finally {
      setBusy(null);
    }
  };

  const claudeStatus: ConnStatus = claudeConnected
    ? ConnStatus.Connected
    : busy === 'claude'
      ? ConnStatus.Pending
      : ConnStatus.Idle;
  const githubStatus: ConnStatus = githubConnected
    ? ConnStatus.Connected
    : busy === 'github'
      ? ConnStatus.Pending
      : ConnStatus.Idle;

  return (
    <main className="flex h-screen flex-col bg-base">
      <header className="flex items-center justify-between border-b border-edge px-6 py-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-wide text-foreground">FlowState</h1>
          <span className="text-xs text-muted-foreground">Connect your tools</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={recheck} disabled={busy === 'refresh'}>
            {busy === 'refresh' ? 'Checking…' : 'Re-check'}
          </Button>
          {onClose ? (
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-5 overflow-hidden p-6 lg:grid-cols-[380px_1fr]">
        {/* Left: connect cards */}
        <div className="flex flex-col gap-5 overflow-y-auto">
          <Card>
            <CardHeader
              title="Claude Code"
              subtitle="Sign in so FlowState can drive agent sessions with your login."
              right={<StatusPill status={claudeStatus} />}
            />
            <div className="px-4 py-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={claudeLogin}
                  disabled={!terminalId || busy === 'claude'}
                  variant={claudeConnected ? 'secondary' : 'primary'}
                >
                  {busy === 'claude'
                    ? 'Working…'
                    : claudeConnected
                      ? 'Sign in to a different account'
                      : 'Log in to Claude'}
                </Button>
                {claudeConnected ? (
                  <Button
                    variant="ghost"
                    onClick={claudeLogout}
                    disabled={!terminalId || busy === 'claude'}
                  >
                    Log out
                  </Button>
                ) : null}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Runs <code className="text-neutral-300">claude auth login</code> in the terminal and
                opens your browser. FlowState detects when you finish and stores the credential
                securely.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="GitHub"
              subtitle="Authenticate so FlowState can read repos and open PRs."
              right={<StatusPill status={githubStatus} />}
            />
            <div className="px-4 py-4">
              {hasGh !== false ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={githubLogin}
                    disabled={!terminalId || busy === 'github'}
                    variant={githubConnected ? 'secondary' : 'primary'}
                  >
                    {busy === 'github'
                      ? 'Working…'
                      : githubConnected
                        ? 'Sign in to a different account'
                        : 'Sign in to GitHub'}
                  </Button>
                  {githubConnected ? (
                    <Button
                      variant="ghost"
                      onClick={githubLogout}
                      disabled={!terminalId || busy === 'github'}
                    >
                      Log out
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {!githubConnected ? (
                <div className="mt-3">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-neutral-200 hover:underline"
                    onClick={() => setShowPat((v) => !v)}
                  >
                    {hasGh === false
                      ? 'gh CLI not found — paste a token instead'
                      : 'Use a personal access token instead'}
                  </button>
                  {showPat ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="password"
                        value={pat}
                        onChange={(e) => setPat(e.target.value)}
                        placeholder="ghp_… or gho_…"
                        className="min-w-0 flex-1 rounded-md border border-edge bg-base px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                      />
                      <Button
                        variant="secondary"
                        onClick={submitPat}
                        disabled={!pat.trim() || busy === 'pat'}
                      >
                        Save
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Runs <code className="text-neutral-300">gh auth login</code> in the terminal. The
                token is encrypted with your OS keychain — only ciphertext is written to disk.
              </p>
            </div>
          </Card>
        </div>

        {/* Right: the shared embedded terminal */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader
            title="Terminal"
            subtitle="Your login shell — the buttons drive it for you."
          />
          <div className="min-h-0 flex-1 bg-surface p-2">
            <TerminalView onSpawned={onSpawned} />
          </div>
        </Card>
      </div>
    </main>
  );
}
