///////////////
// Constants //
///////////////

/** Raw SDK tool name for the plan-mode exit prompt. Rendered specially — its
 * `input.plan` is markdown we render as a formatted plan rather than raw JSON. */
export const EXIT_PLAN_MODE_TOOL = 'ExitPlanMode';

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
