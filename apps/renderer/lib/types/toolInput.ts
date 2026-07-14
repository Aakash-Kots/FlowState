/**
 * Renderer-side shapes for the Claude Agent SDK tool-call `input` objects we
 * give custom rendering to. The SDK delivers `input` as `unknown`, so these are
 * the fields we read off it; each is validated by the matching schema in
 * `../schemas/toolInput` (`.safeParse`) before use, falling back to the raw-JSON
 * row on mismatch. Only the fields we render are declared — extra SDK fields are
 * ignored.
 */

/** A single before→after replacement within an Edit/MultiEdit call. */
export type Replacement = {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

export type EditInput = {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

export type MultiEditInput = {
  file_path: string;
  edits: Replacement[];
};

export type ReadInput = {
  file_path: string;
  offset?: number;
  limit?: number;
};

export type WriteInput = {
  file_path: string;
  content: string;
};

export type GrepInput = {
  pattern: string;
  path?: string;
  glob?: string;
};

export type GlobInput = {
  pattern: string;
  path?: string;
};

export type BashInput = {
  command: string;
  description?: string;
};

/** One row of a TodoWrite call; `status` stays a raw SDK string. */
export type TodoItem = {
  content: string;
  status: string;
  activeForm?: string;
};

export type TodoWriteInput = {
  todos: TodoItem[];
};

export type WebFetchInput = {
  url: string;
  prompt: string;
};

export type TaskInput = {
  description: string;
  prompt: string;
  subagent_type?: string;
};

/** ExitPlanMode's input: the plan is a markdown string we render as a plan. */
export type ExitPlanModeInput = {
  plan: string;
};
