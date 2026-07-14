'use client';

import { useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import {
  PermissionBehavior,
  type PermissionRequest,
  type QuestionRequest,
} from '@flowstate/shared';
import { answerQuestion, interruptSession, respondPermission, useChat, useTabId } from '@/lib/chat';
import { EXIT_PLAN_MODE_TOOL } from '@/lib/constants/tools';
import { cn } from '../ui/cn';
import { Button } from '../ui/Button';
import { ToolInputPreview } from './tools/ToolInputPreview';

/////////////////
// Sub-prompts //
/////////////////

/** Relocated Allow/Deny prompt for a tool call awaiting permission: a generic
 * title + a rich {@link ToolInputPreview} (diff/file/command, JSON fallback) +
 * Allow/Deny. ExitPlanMode plans are handled elsewhere — they render inline in
 * the stream with their actions on the composer — so they never reach here. */
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
        <div className="mb-3 overflow-hidden rounded-lg border border-border">
          <ToolInputPreview toolName={request.toolName} input={request.input} />
        </div>
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

  // Select-then-Submit: a row click sets the selection (single-select replaces,
  // multi-select toggles) and the always-visible footer confirms — so behaviour
  // is uniform regardless of the question's cardinality.
  const pickOption = (question: string, multiSelect: boolean, label: string) => {
    setOther((o) => ({ ...o, [question]: '' }));
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
  };

  return (
    <div className="flex flex-col">
      {request.questions.map((q) => {
        const chosen = new Set(selections[q.question] ?? []);
        return (
          <div key={q.question} className="flex flex-col">
            <div className="px-3 py-2.5 text-sm text-neutral-100">{q.question}</div>
            {q.options.map((opt) => {
              const isChosen = chosen.has(opt.label);
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => pickOption(q.question, q.multiSelect, opt.label)}
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors',
                    isChosen ? 'bg-primary/10 text-neutral-100' : 'text-neutral-300 hover:bg-muted',
                  )}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {isChosen && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{opt.label}</span>
                    {opt.description && (
                      <span className="text-[11px] leading-snug text-muted-foreground">
                        {opt.description}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            <div className="flex items-center gap-2 border-t border-border px-3 py-2">
              <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={other[q.question] ?? ''}
                placeholder="Type your own answer…"
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
                className="w-full bg-transparent text-xs text-neutral-100 placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>
        );
      })}
      <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
        <Button
          variant="secondary"
          className="px-2.5 py-1 text-xs"
          onClick={() => interruptSession(tabId)}
        >
          Cancel
        </Button>
        <Button className="px-2.5 py-1 text-xs" onClick={submit}>
          Submit
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

  // Plans render inline in the stream (with their actions on the composer), not
  // here — surface the first *non-plan* permission instead.
  const permission = pendingPermissions.find((p) => p.toolName !== EXIT_PLAN_MODE_TOOL);
  if (permission) return <PermissionPrompt request={permission} />;
  if (pendingQuestions.length > 0) return <QuestionPrompt request={pendingQuestions[0]} />;
  return null;
}
