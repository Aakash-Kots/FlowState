'use client';

import { useMemo } from 'react';
import { ChatBlockType, ClaudeSessionState } from '@flowstate/shared';
import { selectLatestTodoBlock, useChat } from '@/lib/chat';
import { todoWriteInputSchema } from '@/lib/schemas/toolInput';
import type { TodoItem } from '@/lib/types/toolInput';
import { TodoPreview } from './tools/previews';

/**
 * The live task list pinned directly above the composer textbox. Mirrors the
 * most recent `TodoWrite` call so the user watches items tick off (○ → ◐ → ✓)
 * while Claude works, without scrolling the transcript. The list scrolls
 * internally at a fixed max-height so a long list never shoves the textbox down.
 * Hides itself once every task is done and the session has gone idle.
 */
export function TaskTracker() {
  const block = useChat(selectLatestTodoBlock);
  const sessionState = useChat((s) => s.sessionState);

  const todos = useMemo<TodoItem[]>(() => {
    if (!block || block.type !== ChatBlockType.ToolUse) return [];
    const parsed = todoWriteInputSchema.safeParse(block.input);
    return parsed.success ? parsed.data.todos : [];
  }, [block]);

  if (todos.length === 0) return null;

  const total = todos.length;
  const done = todos.filter((t) => t.status === 'completed').length;
  const open = total - done;

  // Once the run has finished and nothing is left open, drop the list so it
  // stops taking space; the next `TodoWrite` (or a running turn) brings it back.
  if (open === 0 && sessionState === ClaudeSessionState.Idle) return null;

  return (
    <div className="border-b border-border px-2.5 py-2">
      <div className="px-1 text-[11px] font-medium text-muted-foreground">
        Tasks · {done} done, {open} open
      </div>
      <div className="max-h-40 overflow-y-auto">
        <TodoPreview todos={todos} />
      </div>
    </div>
  );
}
