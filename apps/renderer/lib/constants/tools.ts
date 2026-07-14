import {
  Bot,
  ClipboardList,
  Eye,
  FilePlus,
  FolderSearch,
  Globe,
  ListTodo,
  Pencil,
  Plug,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

///////////////
// Constants //
///////////////

/** Raw SDK tool name for the plan-mode exit prompt. Rendered specially — its
 * `input.plan` is markdown we render as a formatted plan rather than raw JSON. */
export const EXIT_PLAN_MODE_TOOL = 'ExitPlanMode';

/** Raw SDK tool name for a structured question. Asked and answered inline near
 * the input bar, not as a transcript row, so its tool call is hidden from the
 * flattened chat items. */
export const ASK_USER_QUESTION_TOOL = 'AskUserQuestion';

/** Raw SDK tool name → lucide icon for its row (and the collapsed tool-group
 * summary). Keyed by the same names as `TOOL_COLORS` / `TOOL_ROWS`; unlisted /
 * `mcp__*` tools are handled by `iconForTool`. This is the single source of
 * truth the per-tool rows and the group summary bar both read from. */
const TOOL_ICONS: Record<string, LucideIcon> = {
  Edit: Pencil,
  MultiEdit: Pencil,
  Write: FilePlus,
  Read: Eye,
  Grep: Search,
  Glob: FolderSearch,
  Bash: Terminal,
  WebFetch: Globe,
  Task: Bot,
  TodoWrite: ListTodo,
  ExitPlanMode: ClipboardList,
};

/** Neutral fallback icon for tools without a signature icon. */
const DEFAULT_TOOL_ICON: LucideIcon = Wrench;

/** Raw SDK tool name → Tailwind text-color class for its row's name label (and,
 * for non-file tools, its icon). Keyed by the same names as `TOOL_ROWS` in the
 * tool registry; tool names are raw SDK strings, so this is a plain map rather
 * than an enum. Unlisted / `mcp__*` tools are handled by `colorForTool`. */
const TOOL_COLORS: Record<string, string> = {
  Edit: 'text-amber-400',
  MultiEdit: 'text-amber-400',
  Write: 'text-green-400',
  Read: 'text-sky-400',
  Grep: 'text-cyan-400',
  Glob: 'text-cyan-400',
  Bash: 'text-violet-400',
  WebFetch: 'text-blue-400',
  Task: 'text-fuchsia-400',
  TodoWrite: 'text-teal-400',
  ExitPlanMode: 'text-amber-300',
};

/** Neutral fallback for tools without a signature color. */
const DEFAULT_TOOL_COLOR = 'text-neutral-300';

/////////////
// Helpers //
/////////////

/** The signature text-color class for a tool name: its mapped color, indigo for
 * `mcp__*` tools, or a neutral default for everything else. Mirrors the fallback
 * shape of `rowForTool`. */
export function colorForTool(name: string): string {
  if (TOOL_COLORS[name]) return TOOL_COLORS[name];
  if (name.startsWith('mcp__')) return 'text-indigo-400';
  return DEFAULT_TOOL_COLOR;
}

/** The lucide icon for a tool name: its mapped icon, `Plug` for `mcp__*` tools,
 * or a neutral default for everything else. Mirrors the fallback shape of
 * `colorForTool` / `rowForTool`. */
export function iconForTool(name: string): LucideIcon {
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  if (name.startsWith('mcp__')) return Plug;
  return DEFAULT_TOOL_ICON;
}
