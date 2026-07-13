/**
 * Runtime validation for the tool-call `input` shapes the chat rows render.
 * `input` arrives as `unknown` from the SDK, so each row `.safeParse`s it here
 * and falls back to the raw-JSON row on mismatch. Mirrors `../types/toolInput`;
 * schemas are lenient (`.passthrough()`) so unknown SDK fields don't fail parse.
 */
import { z } from 'zod';
import type {
  BashInput,
  EditInput,
  GlobInput,
  GrepInput,
  MultiEditInput,
  ReadInput,
  Replacement,
  TaskInput,
  TodoItem,
  TodoWriteInput,
  WebFetchInput,
  WriteInput,
} from '../types/toolInput';

const replacementSchema: z.ZodType<Replacement> = z
  .object({
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional(),
  })
  .passthrough();

export const editInputSchema: z.ZodType<EditInput> = z
  .object({
    file_path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional(),
  })
  .passthrough();

export const multiEditInputSchema: z.ZodType<MultiEditInput> = z
  .object({
    file_path: z.string(),
    edits: z.array(replacementSchema),
  })
  .passthrough();

export const readInputSchema: z.ZodType<ReadInput> = z
  .object({
    file_path: z.string(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  })
  .passthrough();

export const writeInputSchema: z.ZodType<WriteInput> = z
  .object({
    file_path: z.string(),
    content: z.string(),
  })
  .passthrough();

export const grepInputSchema: z.ZodType<GrepInput> = z
  .object({
    pattern: z.string(),
    path: z.string().optional(),
    glob: z.string().optional(),
  })
  .passthrough();

export const globInputSchema: z.ZodType<GlobInput> = z
  .object({
    pattern: z.string(),
    path: z.string().optional(),
  })
  .passthrough();

export const bashInputSchema: z.ZodType<BashInput> = z
  .object({
    command: z.string(),
    description: z.string().optional(),
  })
  .passthrough();

const todoItemSchema: z.ZodType<TodoItem> = z
  .object({
    content: z.string(),
    status: z.string(),
    activeForm: z.string().optional(),
  })
  .passthrough();

export const todoWriteInputSchema: z.ZodType<TodoWriteInput> = z
  .object({
    todos: z.array(todoItemSchema),
  })
  .passthrough();

export const webFetchInputSchema: z.ZodType<WebFetchInput> = z
  .object({
    url: z.string(),
    prompt: z.string(),
  })
  .passthrough();

export const taskInputSchema: z.ZodType<TaskInput> = z
  .object({
    description: z.string(),
    prompt: z.string(),
    subagent_type: z.string().optional(),
  })
  .passthrough();
