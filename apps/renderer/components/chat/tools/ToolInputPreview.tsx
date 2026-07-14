'use client';

import type { ReactNode } from 'react';
import { buildEditPatch, buildMultiEditPatch } from '@/lib/diff';
import { langForPath } from '@/lib/highlight';
import {
  bashInputSchema,
  editInputSchema,
  globInputSchema,
  grepInputSchema,
  multiEditInputSchema,
  readInputSchema,
  taskInputSchema,
  todoWriteInputSchema,
  webFetchInputSchema,
  writeInputSchema,
} from '@/lib/schemas/toolInput';
import { CodePreview, DiffPreview, TodoPreview } from './previews';

/////////////
// Helpers //
/////////////

/** A one-line muted summary for tools whose call is just a target (path/url). */
function Summary({ children }: { children: ReactNode }) {
  return <div className="px-3 py-2 text-xs text-muted-foreground">{children}</div>;
}

/** Raw-JSON fallback — the pre-existing presentation, kept for unknown/MCP tools
 * and inputs that don't match their schema. (The caller supplies the border.) */
function JsonFallback({ input }: { input: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap bg-secondary p-2 font-mono text-xs text-neutral-300">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}

////////////
// Export //
////////////

/**
 * The rich, inline preview of a pending tool call in the permission prompt — the
 * same input schemas + previews the transcript rows use ({@link ./rows}), but
 * full width and with no result yet. Falls back to raw JSON for unknown/MCP tools
 * or inputs that fail their schema. ExitPlanMode never reaches here (it renders
 * the dedicated PlanPrompt).
 */
export function ToolInputPreview({ toolName, input }: { toolName: string; input: unknown }) {
  switch (toolName) {
    case 'Edit': {
      const parsed = editInputSchema.safeParse(input);
      if (!parsed.success) break;
      const { file_path, old_string, new_string } = parsed.data;
      return (
        <DiffPreview
          patch={buildEditPatch(file_path, old_string, new_string)}
          lang={langForPath(file_path)}
          fluid
        />
      );
    }
    case 'MultiEdit': {
      const parsed = multiEditInputSchema.safeParse(input);
      if (!parsed.success) break;
      const { file_path, edits } = parsed.data;
      const patch = buildMultiEditPatch(
        file_path,
        edits.map((e) => ({ oldString: e.old_string, newString: e.new_string })),
      );
      return <DiffPreview patch={patch} lang={langForPath(file_path)} fluid />;
    }
    case 'Write': {
      const parsed = writeInputSchema.safeParse(input);
      if (!parsed.success) break;
      const { file_path, content } = parsed.data;
      return <CodePreview code={content} lang={langForPath(file_path)} fluid />;
    }
    case 'Bash': {
      const parsed = bashInputSchema.safeParse(input);
      if (!parsed.success) break;
      const { command, description } = parsed.data;
      return (
        <>
          {description && <Summary>{description}</Summary>}
          <CodePreview code={`$ ${command}`} lang={null} fluid />
        </>
      );
    }
    case 'TodoWrite': {
      const parsed = todoWriteInputSchema.safeParse(input);
      if (!parsed.success) break;
      return <TodoPreview todos={parsed.data.todos} fluid />;
    }
    case 'Read': {
      const parsed = readInputSchema.safeParse(input);
      if (!parsed.success) break;
      return <Summary>Read {parsed.data.file_path}</Summary>;
    }
    case 'Grep': {
      const parsed = grepInputSchema.safeParse(input);
      if (!parsed.success) break;
      const { pattern, path, glob } = parsed.data;
      const scope = glob ? ` (glob ${glob})` : path ? ` in ${path}` : '';
      return (
        <Summary>
          Search <code className="font-mono">{pattern}</code>
          {scope}
        </Summary>
      );
    }
    case 'Glob': {
      const parsed = globInputSchema.safeParse(input);
      if (!parsed.success) break;
      const { pattern, path } = parsed.data;
      return (
        <Summary>
          Glob <code className="font-mono">{pattern}</code>
          {path ? ` in ${path}` : ''}
        </Summary>
      );
    }
    case 'WebFetch': {
      const parsed = webFetchInputSchema.safeParse(input);
      if (!parsed.success) break;
      return <Summary>Fetch {parsed.data.url}</Summary>;
    }
    case 'Task': {
      const parsed = taskInputSchema.safeParse(input);
      if (!parsed.success) break;
      const { description, subagent_type } = parsed.data;
      return (
        <Summary>
          {subagent_type ? `${subagent_type}: ` : ''}
          {description}
        </Summary>
      );
    }
  }
  return <JsonFallback input={input} />;
}
