'use client';

import {
  Bot,
  ClipboardList,
  FolderSearch,
  Globe,
  ListTodo,
  Plug,
  Search,
  Terminal,
} from 'lucide-react';
import { fileTypeForPath } from '@/lib/constants/fileTypes';
import { colorForTool } from '@/lib/constants/tools';
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
import { DefaultToolRow } from './DefaultToolRow';
import { CodePreview, DiffPreview, PlanPreview, TextPreview, TodoPreview } from './previews';
import { ToolRowShell } from './ToolRowShell';

/////////////
// Helpers //
/////////////

const ICON = 'size-3.5';

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
  const { Icon, color } = fileTypeForPath(file_path);
  return (
    <ToolRowShell
      icon={<Icon className={ICON} />}
      name="Edit"
      iconColor={color}
      nameColor={colorForTool('Edit')}
      target={basename(file_path)}
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
  const { Icon, color } = fileTypeForPath(file_path);
  return (
    <ToolRowShell
      icon={<Icon className={ICON} />}
      name="Edit"
      iconColor={color}
      nameColor={colorForTool('Edit')}
      target={basename(file_path)}
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
  const { Icon, color } = fileTypeForPath(file_path);
  return (
    <ToolRowShell
      icon={<Icon className={ICON} />}
      name="Read"
      iconColor={color}
      nameColor={colorForTool('Read')}
      target={basename(file_path)}
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
  const { Icon, color } = fileTypeForPath(file_path);
  return (
    <ToolRowShell
      icon={<Icon className={ICON} />}
      name="Write"
      iconColor={color}
      nameColor={colorForTool('Write')}
      target={basename(file_path)}
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
      icon={<Search className={ICON} />}
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
      icon={<FolderSearch className={ICON} />}
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
      icon={<Terminal className={ICON} />}
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
      icon={<Globe className={ICON} />}
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
      icon={<Bot className={ICON} />}
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
      icon={<Plug className={ICON} />}
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
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { plan } = parsed.data;
  return (
    <ToolRowShell
      icon={<ClipboardList className={ICON} />}
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
      icon={<ListTodo className={ICON} />}
      name="Update todos"
      iconColor={colorForTool('TodoWrite')}
      nameColor={colorForTool('TodoWrite')}
      target={`${done}/${todos.length} done`}
      isError={result?.isError}
      preview={<TodoPreview todos={todos} />}
    />
  );
}
