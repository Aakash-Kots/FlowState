'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  PermissionBehavior,
  type PermissionRequest,
  type QuestionItem,
  type QuestionRequest,
} from '@flowstate/shared';
import { answerQuestion, interruptSession, respondPermission, useChat, useTabId } from '@/lib/chat';
import { EXIT_PLAN_MODE_TOOL } from '@/lib/constants/tools';
import { cn } from '../ui/cn';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
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

/** Bottom-left step indicator: chevrons flanking one segment per question.
 * Answered segments are solid and clickable (jump back to edit); the current
 * segment is a wider capsule; upcoming ones are dim. Hidden for single questions. */
function Stepper({
  questions,
  step,
  answered,
  onStep,
}: {
  questions: QuestionItem[];
  step: number;
  answered: (q: QuestionItem) => boolean;
  onStep: (n: number) => void;
}) {
  if (questions.length <= 1) return null;
  const canAdvance = answered(questions[step]);
  return (
    <div className="flex items-center gap-1.5">
      <IconButton
        variant="ghost"
        className="h-6 w-6"
        disabled={step === 0}
        onClick={() => onStep(step - 1)}
        title="Previous question"
        aria-label="Previous question"
      >
        <ChevronLeft className="h-4 w-4" />
      </IconButton>
      <div className="flex items-center gap-1">
        {questions.map((q, i) => {
          const isCurrent = i === step;
          const isAnswered = answered(q);
          const canJump = isAnswered && !isCurrent;
          return (
            <button
              key={q.question}
              type="button"
              disabled={!canJump}
              onClick={() => onStep(i)}
              aria-label={`Question ${i + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all',
                isCurrent ? 'w-4 bg-primary/60' : 'w-1.5',
                !isCurrent && (isAnswered ? 'bg-primary' : 'bg-muted'),
                canJump && 'cursor-pointer hover:bg-primary/80',
              )}
            />
          );
        })}
      </div>
      <IconButton
        variant="ghost"
        className="h-6 w-6"
        disabled={step === questions.length - 1 || !canAdvance}
        onClick={() => onStep(step + 1)}
        title="Next question"
        aria-label="Next question"
      >
        <ChevronRight className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

/** Inline answer UI for an AskUserQuestion prompt: one question at a time, plain
 * numbered rows (number keys pick; `0` focuses the free-text row), a bottom-left
 * stepper, and an ↑ button that advances then confirms all answers on the last
 * step. Answers are combined into the same `{ question: answer }` map submitted
 * by the pre-existing {@link answerQuestion} path. */
function QuestionPrompt({ request }: { request: QuestionRequest }) {
  const tabId = useTabId();
  const questions = request.questions;
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = questions[step];
  const isLast = step === questions.length - 1;

  const answerFor = (question: string): string => {
    const chosen = selections[question] ?? [];
    if (chosen.length > 0) return chosen.join(', ');
    return (other[question] ?? '').trim();
  };
  const answered = (q: QuestionItem) => answerFor(q.question).length > 0;
  const allAnswered = questions.every(answered);
  const currentAnswered = answered(current);

  const submit = () => {
    const answers: Record<string, string> = {};
    for (const q of questions) {
      const a = answerFor(q.question);
      if (a) answers[q.question] = a;
    }
    if (Object.keys(answers).length > 0) answerQuestion(tabId, request.id, answers);
  };

  // The ↑ button (and Enter): confirm on the last step once everything's
  // answered, otherwise step forward when the current question is answered.
  const proceed = () => {
    if (isLast) {
      if (allAnswered) submit();
    } else if (currentAnswered) {
      setStep(step + 1);
    }
  };

  // A row click: single-select replaces the choice and auto-advances (unless
  // last); multi-select toggles and stays put. Either way clears the free text.
  const pickOption = (label: string) => {
    const question = current.question;
    setOther((o) => ({ ...o, [question]: '' }));
    if (current.multiSelect) {
      setSelections((s) => {
        const cur = new Set(s[question] ?? []);
        if (cur.has(label)) cur.delete(label);
        else cur.add(label);
        return { ...s, [question]: [...cur] };
      });
      return;
    }
    setSelections((s) => ({ ...s, [question]: [label] }));
    if (!isLast) setStep(step + 1);
  };

  // Refocus the container on mount and every step change so number-key shortcuts
  // keep working after an auto-advance; typing in the free-text input keeps focus
  // there (no step change) so digits land in the field.
  useEffect(() => {
    containerRef.current?.focus();
  }, [step]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      interruptSession(tabId);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      proceed();
      return;
    }
    // While typing in the free-text field, let every other key through.
    if (e.target === inputRef.current) return;
    if (e.key === '0') {
      e.preventDefault();
      inputRef.current?.focus();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const opt = current.options[Number(e.key) - 1];
      if (opt) {
        e.preventDefault();
        pickOption(opt.label);
      }
    }
  };

  const chosen = new Set(selections[current.question] ?? []);

  return (
    <div ref={containerRef} tabIndex={-1} onKeyDown={onKeyDown} className="flex flex-col p-3 focus:outline-none">
      <div className="mb-1 flex items-start gap-2">
        <div className="flex-1 py-1 text-sm text-neutral-100">{current.question}</div>
        <IconButton
          variant="ghost"
          className="h-7 w-7"
          onClick={() => interruptSession(tabId)}
          title="Cancel"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="flex flex-col">
        {current.options.map((opt, i) => {
          const isChosen = chosen.has(opt.label);
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => pickOption(opt.label)}
              className="flex w-full items-center gap-3 rounded px-2 py-2 text-left transition-colors hover:bg-muted"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-xs text-muted-foreground">
                {isChosen ? <Check className="h-3.5 w-3.5 text-primary" /> : i + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-neutral-100">{opt.label}</span>
                {opt.description && (
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {opt.description}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        <div className="flex w-full items-center gap-3 rounded px-2 py-2">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-xs text-muted-foreground">
            0
          </span>
          <input
            ref={inputRef}
            value={other[current.question] ?? ''}
            placeholder="Type something…"
            onChange={(e) => {
              const value = e.target.value;
              setOther((o) => ({ ...o, [current.question]: value }));
              if (value) setSelections((s) => ({ ...s, [current.question]: [] }));
            }}
            className="w-full bg-transparent text-sm text-neutral-100 placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Stepper questions={questions} step={step} answered={answered} onStep={setStep} />
        <IconButton
          className="ml-auto"
          onClick={proceed}
          disabled={isLast ? !allAnswered : !currentAnswered}
          title={isLast ? 'Confirm' : 'Next'}
          aria-label={isLast ? 'Confirm' : 'Next'}
        >
          <ArrowUp className="h-4 w-4" />
        </IconButton>
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
