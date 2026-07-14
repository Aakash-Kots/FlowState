'use client';

import { useChat } from '@/lib/chat';
import { colorForTool, EXIT_PLAN_MODE_TOOL, iconForTool } from '@/lib/constants/tools';
import { buildEditPatch, buildMultiEditPatch } from '@/lib/diff';
import { langForPath } from '@/lib/highlight';
import {
  bashInputSchema,
  editInputSchema,
  exitPlanModeInputSchema,
  globInputSchema,
  grepInputSchema,
  multiEditInputSchema,
  readInputSchema,
  taskInputSchema,
  todoWriteInputSchema,
  webFetchInputSchema,
  writeInputSchema,
} from '@/lib/schemas/toolInput';
import type { ToolRowProps } from '@/lib/types/chat';
import { FileRef } from '../FileRef';
import { DefaultToolRow } from './DefaultToolRow';
import {
  CodePreview,
  DiffPreview,
  PlanDocument,
  PlanPreview,
  TextPreview,
  TodoPreview,
} from './previews';
import { ToolRowShell } from './ToolRowShell';

/////////////
// Helpers //
/////////////

const ICON = 'size-3.5';

/** The tool's signature lucide icon (from the shared `iconForTool` map), sized
 * for a compact row. */
function ToolIcon({ name }: { name: string }) {
  const Icon = iconForTool(name);
  return <Icon className={ICON} />;
}

/** Trailing path segment (filename) for a compact row label. */
function basename(path: string): string {
  const base = path.split('/').pop();
  return base && base.length > 0 ? base : path;
}

/** Host of a URL for a compact label, falling back to the raw string. */
function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** Preview of a tool result, or a muted "still running" note when absent. */
function resultPreview(result: ToolRowProps['result'], pendingLabel: string) {
  if (!result) return <TextPreview>{pendingLabel}</TextPreview>;
  return <CodePreview code={result.content || '(no output)'} lang={null} />;
}

/** Strip the Read tool's `cat -n` line-number gutter (`   12→` / `   12\t`) so
 * the raw source can be syntax-highlighted cleanly. */
function stripReadGutter(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*\d+(?:\t|→)/, ''))
    .join('\n');
}

///////////////////
// File tools //
///////////////////

export function EditToolRow({ block, result }: ToolRowProps) {
  const parsed = editInputSchema.safeParse(block.input);
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { file_path, old_string, new_string } = parsed.data;
  return (
    <ToolRowShell
      icon={<ToolIcon name="Edit" />}
      name="Edit"
      nameColor={colorForTool('Edit')}
      target={<FileRef path={file_path} />}
      targetAsChip
      targetTitle={file_path}
      isError={result?.isError}
      preview={
        <DiffPreview patch={buildEditPatch(file_path, old_string, new_string)} lang={langForPath(file_path)} />
      }
    />
  );
}

export function MultiEditToolRow({ block, result }: ToolRowProps) {
  const parsed = multiEditInputSchema.safeParse(block.input);
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { file_path, edits } = parsed.data;
  const patch = buildMultiEditPatch(
    file_path,
    edits.map((e) => ({ oldString: e.old_string, newString: e.new_string })),
  );
  return (
    <ToolRowShell
      icon={<ToolIcon name="MultiEdit" />}
      name="Edit"
      nameColor={colorForTool('Edit')}
      target={<FileRef path={file_path} />}
      targetAsChip
      targetTitle={file_path}
      meta={`${edits.length} edit${edits.length === 1 ? '' : 's'}`}
      isError={result?.isError}
      preview={<DiffPreview patch={patch} lang={langForPath(file_path)} />}
    />
  );
}

export function ReadToolRow({ block, result }: ToolRowProps) {
  const parsed = readInputSchema.safeParse(block.input);
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { file_path } = parsed.data;
  // Highlight the file in its own language (Prism), after dropping the Read
  // tool's line-number gutter so it tokenizes as clean source.
  const preview = result ? (
    <CodePreview code={stripReadGutter(result.content)} lang={langForPath(file_path)} />
  ) : (
    <TextPreview>Reading…</TextPreview>
  );
  return (
    <ToolRowShell
      icon={<ToolIcon name="Read" />}
      name="Read"
      nameColor={colorForTool('Read')}
      target={<FileRef path={file_path} />}
      targetAsChip
      targetTitle={file_path}
      isError={result?.isError}
      preview={preview}
    />
  );
}

export function WriteToolRow({ block, result }: ToolRowProps) {
  const parsed = writeInputSchema.safeParse(block.input);
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { file_path, content } = parsed.data;
  return (
    <ToolRowShell
      icon={<ToolIcon name="Write" />}
      name="Write"
      nameColor={colorForTool('Write')}
      target={<FileRef path={file_path} />}
      targetAsChip
      targetTitle={file_path}
      isError={result?.isError}
      preview={<CodePreview code={content} lang={langForPath(file_path)} />}
    />
  );
}

////////////////
// Search tools //
////////////////

export function GrepToolRow({ block, result }: ToolRowProps) {
  const parsed = grepInputSchema.safeParse(block.input);
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { pattern, path, glob } = parsed.data;
  const scope = glob ? `glob ${glob}` : path ? `in ${basename(path)}` : undefined;
  return (
    <ToolRowShell
      icon={<ToolIcon name="Grep" />}
      name="Grep"
      iconColor={colorForTool('Grep')}
      nameColor={colorForTool('Grep')}
      target={pattern}
      targetTitle={pattern}
      meta={scope}
      isError={result?.isError}
      preview={resultPreview(result, 'Searching…')}
    />
  );
}

export function GlobToolRow({ block, result }: ToolRowProps) {
  const parsed = globInputSchema.safeParse(block.input);
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { pattern, path } = parsed.data;
  return (
    <ToolRowShell
      icon={<ToolIcon name="Glob" />}
      name="Glob"
      iconColor={colorForTool('Glob')}
      nameColor={colorForTool('Glob')}
      target={pattern}
      targetTitle={pattern}
      meta={path ? `in ${basename(path)}` : undefined}
      isError={result?.isError}
      preview={resultPreview(result, 'Matching…')}
    />
  );
}

////////////////
// Exec tools //
////////////////

export function BashToolRow({ block, result }: ToolRowProps) {
  const parsed = bashInputSchema.safeParse(block.input);
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { command, description } = parsed.data;
  const output = result ? result.content || '(no output)' : '(running…)';
  return (
    <ToolRowShell
      icon={<ToolIcon name="Bash" />}
      name="Bash"
      iconColor={colorForTool('Bash')}
      nameColor={colorForTool('Bash')}
      target={command.split('\n')[0]}
      targetTitle={description ?? command}
      isError={result?.isError}
      preview={<CodePreview code={`$ ${command}\n\n${output}`} lang={null} />}
    />
  );
}

export function WebFetchToolRow({ block, result }: ToolRowProps) {
  const parsed = webFetchInputSchema.safeParse(block.input);
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { url, prompt } = parsed.data;
  const body = result ? result.content || '(no output)' : '(fetching…)';
  return (
    <ToolRowShell
      icon={<ToolIcon name="WebFetch" />}
      name="Fetch"
      iconColor={colorForTool('WebFetch')}
      nameColor={colorForTool('WebFetch')}
      target={hostOf(url)}
      targetTitle={url}
      isError={result?.isError}
      preview={<CodePreview code={`${prompt}\n\n${body}`} lang={null} />}
    />
  );
}

export function TaskToolRow({ block, result }: ToolRowProps) {
  const parsed = taskInputSchema.safeParse(block.input);
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { description, prompt, subagent_type } = parsed.data;
  const body = result ? result.content || '(no output)' : '(running…)';
  return (
    <ToolRowShell
      icon={<ToolIcon name="Task" />}
      name="Task"
      iconColor={colorForTool('Task')}
      nameColor={colorForTool('Task')}
      target={description}
      targetTitle={prompt}
      meta={subagent_type}
      isError={result?.isError}
      preview={<CodePreview code={`${prompt}\n\n---\n\n${body}`} lang={null} />}
    />
  );
}

//////////////
// MCP tools //
//////////////

export function McpToolRow({ block, result }: ToolRowProps) {
  // `mcp__<server>__<tool>` — surface server + tool without the noise.
  const parts = block.name.split('__');
  const server = parts[1] ?? 'mcp';
  const tool = parts.slice(2).join('__') || block.name;
  const input = JSON.stringify(block.input ?? {}, null, 2);
  const body = result ? result.content || '(no output)' : '(running…)';
  return (
    <ToolRowShell
      icon={<ToolIcon name={block.name} />}
      name={server}
      iconColor={colorForTool(block.name)}
      nameColor={colorForTool(block.name)}
      target={tool}
      targetTitle={block.name}
      isError={result?.isError}
      preview={<CodePreview code={`${input}\n\n---\n\n${body}`} lang="json" />}
    />
  );
}

//////////////
// Planning //
//////////////

export function ExitPlanModeToolRow({ block, result }: ToolRowProps) {
  const parsed = exitPlanModeInputSchema.safeParse(block.input);
  const plan = parsed.success ? parsed.data.plan : null;
  // The tool_use block and its permission request are separate events with no
  // shared id, so correlate on tool name + plan text — there's at most one plan
  // awaiting a decision at a time. While pending, the plan reads as an opened
  // document in the stream; once resolved it collapses to the compact row.
  const pending = useChat((s) =>
    s.pendingPermissions.some((p) => {
      if (p.toolName !== EXIT_PLAN_MODE_TOOL) return false;
      const pp = exitPlanModeInputSchema.safeParse(p.input);
      return pp.success && pp.data.plan === plan;
    }),
  );
  if (plan == null) return <DefaultToolRow block={block} result={result} />;
  if (pending) return <PlanDocument plan={plan} />;
  return (
    <ToolRowShell
      icon={<ToolIcon name="ExitPlanMode" />}
      name="Plan"
      iconColor={colorForTool('ExitPlanMode')}
      nameColor={colorForTool('ExitPlanMode')}
      target="View plan"
      isError={result?.isError}
      preview={<PlanPreview plan={plan} />}
    />
  );
}

export function TodoWriteToolRow({ block, result }: ToolRowProps) {
  const parsed = todoWriteInputSchema.safeParse(block.input);
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { todos } = parsed.data;
  const done = todos.filter((t) => t.status === 'completed').length;
  return (
    <ToolRowShell
      icon={<ToolIcon name="TodoWrite" />}
      name="Update todos"
      iconColor={colorForTool('TodoWrite')}
      nameColor={colorForTool('TodoWrite')}
      target={`${done}/${todos.length} done`}
      isError={result?.isError}
      preview={<TodoPreview todos={todos} />}
    />
  );
}
