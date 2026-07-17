'use client';

import { useChat } from '@/lib/chat';
import { EXIT_PLAN_MODE_TOOL, iconForTool } from '@/lib/constants/tools';
import { editDiffStat, multiEditDiffStat, writeDiffStat } from '@/lib/diff';
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
  EditDiffPreview,
  MultiEditDiffPreview,
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

/** Bash commands that just dump a file's contents to stdout — semantically a
 * file read, so we render them as a Read row rather than a raw command. */
const READ_LIKE_COMMANDS = new Set(['cat', 'bat', 'head', 'tail']);

/** If a Bash command is a single-file view (`cat <path>`, optionally with
 * dash-flags), return that path so it can render as a Read; else null. Bails on
 * anything with shell operators, globs, or extra positional args, where "read
 * this file" no longer describes what ran. */
function readPathFromCommand(command: string): string | null {
  const trimmed = command.trim();
  // Shell operators (pipes, redirects, chaining, substitution) change the
  // semantics — no longer a plain read.
  if (/[\n|&;<>`]|\$\(/.test(trimmed)) return null;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) return null;
  const [cmd, ...rest] = tokens;
  if (!READ_LIKE_COMMANDS.has(cmd)) return null;
  // The path is the final token; everything before it must be a dash-flag, so a
  // valued flag (`head -n 50 file`) or a second file bails out safely.
  const path = rest[rest.length - 1];
  if (path.startsWith('-') || /[*?]/.test(path)) return null;
  if (rest.slice(0, -1).some((t) => !t.startsWith('-'))) return null;
  return path.replace(/^['"]|['"]$/g, '');
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

/** File extensions the Read tool returns as an image rather than text. */
const IMAGE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
  'avif',
]);

/** Whether a path points at an image (so a Read reads a picture, not lines). */
function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext != null && IMAGE_EXTS.has(ext);
}

/** Line count of a Read result's content (a trailing newline isn't its own line). */
function countLines(text: string): number {
  if (text.length === 0) return 0;
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  return body.split('\n').length;
}

/** A bordered monospace chip for a shell command, sitting beside a Bash row's
 * description — the "what ran" detail next to the "what happened" summary. */
function CommandChip({ command }: { command: string }) {
  return (
    <span className="inline-flex min-w-0 items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-muted-foreground">
      <span className="min-w-0 truncate">{command}</span>
    </span>
  );
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
      target={<FileRef path={file_path} />}
      targetAsChip
      targetTitle={file_path}
      counts={editDiffStat(old_string, new_string)}
      isError={result?.isError}
      preview={
        <EditDiffPreview filePath={file_path} oldString={old_string} newString={new_string} />
      }
    />
  );
}

export function MultiEditToolRow({ block, result }: ToolRowProps) {
  const parsed = multiEditInputSchema.safeParse(block.input);
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { file_path, edits } = parsed.data;
  const replacements = edits.map((e) => ({ oldString: e.old_string, newString: e.new_string }));
  return (
    <ToolRowShell
      icon={<ToolIcon name="MultiEdit" />}
      name="Edit"
      target={<FileRef path={file_path} />}
      targetAsChip
      targetTitle={file_path}
      counts={multiEditDiffStat(replacements)}
      meta={`${edits.length} edit${edits.length === 1 ? '' : 's'}`}
      isError={result?.isError}
      preview={<MultiEditDiffPreview filePath={file_path} edits={replacements} />}
    />
  );
}

export function ReadToolRow({ block, result }: ToolRowProps) {
  const parsed = readInputSchema.safeParse(block.input);
  if (!parsed.success) return <DefaultToolRow block={block} result={result} />;
  const { file_path } = parsed.data;
  const image = isImagePath(file_path);
  // Label with what was read: `Read image`, `Read N lines`, or a bare `Read`
  // while still in flight.
  const label = image
    ? 'Read image'
    : result
      ? `Read ${countLines(result.content)} lines`
      : 'Read';
  // Highlight the file in its own language (Prism), after dropping the Read
  // tool's line-number gutter so it tokenizes as clean source.
  const preview = image ? (
    <TextPreview>Image file</TextPreview>
  ) : result ? (
    <CodePreview code={stripReadGutter(result.content)} lang={langForPath(file_path)} />
  ) : (
    <TextPreview>Reading…</TextPreview>
  );
  return (
    <ToolRowShell
      icon={<ToolIcon name="Read" />}
      name={label}
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
      target={<FileRef path={file_path} />}
      targetAsChip
      targetTitle={file_path}
      counts={writeDiffStat(content)}
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

  // A plain `cat <file>` is really a file read — render it as a Read row (icon +
  // filename chip + highlighted contents) instead of a long absolute-path command.
  const readPath = readPathFromCommand(command);
  if (readPath) {
    return (
      <ToolRowShell
        icon={<ToolIcon name="Read" />}
        name="Read"
        target={<FileRef path={readPath} />}
        targetAsChip
        targetTitle={command}
        isError={result?.isError}
        preview={
          result ? (
            <CodePreview code={result.content || '(empty file)'} lang={langForPath(readPath)} />
          ) : (
            <TextPreview>Reading…</TextPreview>
          )
        }
      />
    );
  }

  const output = result ? result.content || '(no output)' : '(running…)';
  const cmdLine = command.split('\n')[0];
  // Lead with the model's description of what the command does; show the command
  // itself in a chip beside it. Without a description, the command is the label.
  return (
    <ToolRowShell
      icon={<ToolIcon name="Bash" />}
      summary={description ?? cmdLine}
      target={description ? <CommandChip command={cmdLine} /> : undefined}
      targetAsChip={description != null}
      targetTitle={command}
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
  // Lead with the subagent's task description (not a generic "Agent"/"Task"
  // label); hovering it reveals the full prompt and the subagent's output.
  return (
    <ToolRowShell
      icon={<ToolIcon name="Task" />}
      summary={description}
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
      target={`${done}/${todos.length} done`}
      isError={result?.isError}
      preview={<TodoPreview todos={todos} />}
    />
  );
}
