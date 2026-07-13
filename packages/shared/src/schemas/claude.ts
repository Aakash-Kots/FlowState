/**
 * Runtime validation for the Claude session + chat protocol. Mirrors
 * `../types/claude`; each schema is annotated with the type it validates so the
 * two cannot silently drift. Enums are validated via `z.nativeEnum` /
 * `z.literal(Enum.Member)`.
 */
import { z } from 'zod';
import {
  ChatBlockType,
  ChatEventKind,
  ChatMessageRole,
  ClaudeSessionState,
  PermissionBehavior,
  ReasoningEffort,
} from '../enums/claude';
import type {
  ChatBlock,
  ChatEvent,
  ChatMessage,
  ChatSnapshot,
  ClaudeMessage,
  ModelOption,
  PermissionRequest,
  QuestionItem,
  QuestionRequest,
} from '../types/claude';

export const claudeSessionStateSchema = z.nativeEnum(ClaudeSessionState);

export const reasoningEffortSchema = z.nativeEnum(ReasoningEffort);

export const modelOptionSchema: z.ZodType<ModelOption> = z.object({
  value: z.string(),
  displayName: z.string(),
  description: z.string(),
  supportsEffort: z.boolean(),
  supportedEffortLevels: z.array(reasoningEffortSchema),
});

export const questionItemSchema: z.ZodType<QuestionItem> = z.object({
  header: z.string(),
  question: z.string(),
  multiSelect: z.boolean(),
  options: z.array(z.object({ label: z.string(), description: z.string() })),
});

export const questionRequestSchema: z.ZodType<QuestionRequest> = z.object({
  id: z.string(),
  questions: z.array(questionItemSchema),
});

export const claudeMessageSchema: z.ZodType<ClaudeMessage> = z.object({
  role: z.string(),
  content: z.unknown(),
  createdAt: z.string().datetime(),
});

export const chatBlockSchema: z.ZodType<ChatBlock> = z.discriminatedUnion('type', [
  z.object({ type: z.literal(ChatBlockType.Text), text: z.string() }),
  z.object({ type: z.literal(ChatBlockType.Thinking), text: z.string() }),
  z.object({
    type: z.literal(ChatBlockType.ToolUse),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal(ChatBlockType.ToolResult),
    toolUseId: z.string(),
    content: z.string(),
    isError: z.boolean(),
  }),
]);

export const chatMessageSchema: z.ZodType<ChatMessage> = z.object({
  id: z.string(),
  role: z.nativeEnum(ChatMessageRole),
  blocks: z.array(chatBlockSchema),
  meta: z
    .object({
      costUsd: z.number().optional(),
      durationMs: z.number().optional(),
      numTurns: z.number().optional(),
      isError: z.boolean().optional(),
    })
    .optional(),
});

export const permissionRequestSchema: z.ZodType<PermissionRequest> = z.object({
  id: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  title: z.string().optional(),
  description: z.string().optional(),
});

export const chatEventSchema: z.ZodType<ChatEvent> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal(ChatEventKind.Init),
    sessionId: z.string(),
    model: z.string(),
    cwd: z.string(),
  }),
  z.object({ kind: z.literal(ChatEventKind.TextDelta), text: z.string() }),
  z.object({ kind: z.literal(ChatEventKind.BlockStart), blockType: z.string() }),
  z.object({
    kind: z.literal(ChatEventKind.Message),
    message: chatMessageSchema,
    createdAt: z.string().datetime(),
  }),
  z.object({ kind: z.literal(ChatEventKind.State), state: claudeSessionStateSchema }),
  z.object({
    kind: z.literal(ChatEventKind.PermissionRequest),
    id: z.string(),
    toolName: z.string(),
    input: z.unknown(),
    title: z.string().optional(),
    description: z.string().optional(),
  }),
  z.object({
    kind: z.literal(ChatEventKind.PermissionResolved),
    id: z.string(),
    behavior: z.nativeEnum(PermissionBehavior),
  }),
  z.object({
    kind: z.literal(ChatEventKind.QuestionRequest),
    id: z.string(),
    questions: z.array(questionItemSchema),
  }),
  z.object({ kind: z.literal(ChatEventKind.QuestionResolved), id: z.string() }),
  z.object({
    kind: z.literal(ChatEventKind.Config),
    model: z.string().nullable(),
    effort: reasoningEffortSchema.nullable(),
    planMode: z.boolean(),
  }),
  z.object({ kind: z.literal(ChatEventKind.Cwd), cwd: z.string().nullable() }),
  z.object({ kind: z.literal(ChatEventKind.Title), title: z.string() }),
  z.object({
    kind: z.literal(ChatEventKind.WorktreeName),
    workspaceId: z.string(),
    name: z.string(),
    branch: z.string(),
  }),
  z.object({ kind: z.literal(ChatEventKind.Error), message: z.string() }),
]);

export const chatSnapshotSchema: z.ZodType<ChatSnapshot> = z.object({
  state: claudeSessionStateSchema,
  sessionId: z.string().nullable(),
  cwd: z.string().nullable(),
  model: z.string().nullable(),
  effort: reasoningEffortSchema.nullable(),
  planMode: z.boolean(),
  messages: z.array(z.object({ message: chatMessageSchema, createdAt: z.string().datetime() })),
  pendingPermissions: z.array(permissionRequestSchema),
  pendingQuestions: z.array(questionRequestSchema),
});
