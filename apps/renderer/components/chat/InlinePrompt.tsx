'use client';

import { useState } from 'react';
import {
  PermissionBehavior,
  type PermissionRequest,
  type QuestionRequest,
} from '@flowstate/shared';
import { answerQuestion, interruptSession, respondPermission, useChat, useTabId } from '@/lib/chat';
import { cn } from '../ui/cn';
import { Button } from '../ui/Button';

/////////////////
// Sub-prompts //
/////////////////

/** Relocated Allow/Deny prompt for a tool call awaiting permission. */
function PermissionPrompt({ request }: { request: PermissionRequest }) {
  const tabId = useTabId();
  return (
    <div className="p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
        <span className="text-sm font-medium text-neutral-100">
          {request.title ?? `Claude wants to use ${request.toolName}`}
        </span>
      </div>
      {request.description && (
        <p className="mb-2 text-xs text-muted-foreground">{request.description}</p>
      )}
      {request.input != null && (
        <pre className="mb-3 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-border bg-secondary p-2 font-mono text-xs text-neutral-300">
          {JSON.stringify(request.input, null, 2)}
        </pre>
      )}
      <div className="flex gap-2">
        <Button onClick={() => respondPermission(tabId, request.id, PermissionBehavior.Allow)}>
          Allow
        </Button>
        <Button
          variant="secondary"
          onClick={() => respondPermission(tabId, request.id, PermissionBehavior.Deny)}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}

/** Inline answer UI for an AskUserQuestion prompt — options + free-text. */
function QuestionPrompt({ request }: { request: QuestionRequest }) {
  const tabId = useTabId();
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const multiQuestion = request.questions.length > 1;

  const answerFor = (question: string): string => {
    const chosen = selections[question] ?? [];
    if (chosen.length > 0) return chosen.join(', ');
    return (other[question] ?? '').trim();
  };

  const submit = () => {
    const answers: Record<string, string> = {};
    for (const q of request.questions) {
      const a = answerFor(q.question);
      if (a) answers[q.question] = a;
    }
    if (Object.keys(answers).length > 0) answerQuestion(tabId, request.id, answers);
  };

  const pickOption = (question: string, multiSelect: boolean, label: string) => {
    if (multiSelect) {
      setSelections((s) => {
        const cur = new Set(s[question] ?? []);
        if (cur.has(label)) cur.delete(label);
        else cur.add(label);
        return { ...s, [question]: [...cur] };
      });
      return;
    }
    setSelections((s) => ({ ...s, [question]: [label] }));
    setOther((o) => ({ ...o, [question]: '' }));
    // Fast path: a single single-select question answers on click, like the CLI.
    if (!multiQuestion) answerQuestion(tabId, request.id, { [question]: label });
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {request.questions.map((q) => {
        const chosen = new Set(selections[q.question] ?? []);
        return (
          <div key={q.question} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-neutral-300">
                {q.header}
              </span>
              <span className="text-sm text-neutral-100">{q.question}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {q.options.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => pickOption(q.question, q.multiSelect, opt.label)}
                  className={cn(
                    'flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-xs transition-colors',
                    chosen.has(opt.label)
                      ? 'border-primary/60 bg-primary/10 text-neutral-100'
                      : 'border-border bg-secondary text-neutral-300 hover:border-border hover:bg-muted',
                  )}
                >
                  <span className="font-medium">{opt.label}</span>
                  {opt.description && (
                    <span className="text-[11px] leading-snug text-muted-foreground">
                      {opt.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <input
              value={other[q.question] ?? ''}
              placeholder="Or type your own answer…"
              onChange={(e) => {
                const value = e.target.value;
                setOther((o) => ({ ...o, [q.question]: value }));
                if (value) setSelections((s) => ({ ...s, [q.question]: [] }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              className="rounded-md border border-border bg-secondary px-3 py-2 text-xs text-neutral-100 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button onClick={submit}>Submit answer</Button>
        <Button variant="secondary" onClick={() => interruptSession(tabId)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/////////////////////
// Primary export  //
/////////////////////

/**
 * The interactive prompt shown inside the floating input card when Claude is
 * waiting on the user — a permission decision or an AskUserQuestion answer.
 * Renders the first pending item (permissions take precedence). Returns null
 * when nothing is pending, so the caller falls back to the normal textarea.
 */
export function InlinePrompt() {
  const pendingPermissions = useChat((s) => s.pendingPermissions);
  const pendingQuestions = useChat((s) => s.pendingQuestions);

  if (pendingPermissions.length > 0) return <PermissionPrompt request={pendingPermissions[0]} />;
  if (pendingQuestions.length > 0) return <QuestionPrompt request={pendingQuestions[0]} />;
  return null;
}
