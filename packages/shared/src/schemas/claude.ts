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
  PermissionMode,
  ReasoningEffort,
} from '../enums/claude';
import { GitFileStatus } from '../enums/git';
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
  SkillOption,
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

export const skillOptionSchema: z.ZodType<SkillOption> = z.object({
  name: z.string(),
  description: z.string(),
  argumentHint: z.string(),
  aliases: z.array(z.string()).optional(),
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
    parentToolUseId: z.string().optional(),
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
      durationMs: z.number().optional(),
      numTurns: z.number().optional(),
      isError: z.boolean().optional(),
      fileChanges: z
        .array(
          z.object({
            path: z.string(),
            status: z.nativeEnum(GitFileStatus),
            insertions: z.number(),
            deletions: z.number(),
          }),
        )
        .optional(),
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
    permissionMode: z.nativeEnum(PermissionMode),
  }),
  z.object({ kind: z.literal(ChatEventKind.Cwd), cwd: z.string().nullable() }),
  z.object({ kind: z.literal(ChatEventKind.Cleared) }),
  z.object({ kind: z.literal(ChatEventKind.Title), title: z.string() }),
  z.object({
    kind: z.literal(ChatEventKind.WorktreeName),
    workspaceId: z.string(),
    name: z.string(),
    branch: z.string(),
  }),
  z.object({
    kind: z.literal(ChatEventKind.SkillsUpdated),
    skills: z.array(skillOptionSchema),
  }),
  z.object({
    kind: z.literal(ChatEventKind.ToolProgress),
    toolName: z.string(),
    elapsedSeconds: z.number(),
  }),
  z.object({
    kind: z.literal(ChatEventKind.ApiRetry),
    attempt: z.number(),
    maxRetries: z.number(),
  }),
  z.object({ kind: z.literal(ChatEventKind.Error), message: z.string() }),
]);

export const chatSnapshotSchema: z.ZodType<ChatSnapshot> = z.object({
  state: claudeSessionStateSchema,
  sessionId: z.string().nullable(),
  cwd: z.string().nullable(),
  model: z.string().nullable(),
  effort: reasoningEffortSchema.nullable(),
  permissionMode: z.nativeEnum(PermissionMode),
  messages: z.array(z.object({ message: chatMessageSchema, createdAt: z.string().datetime() })),
  pendingPermissions: z.array(permissionRequestSchema),
  pendingQuestions: z.array(questionRequestSchema),
  skills: z.array(skillOptionSchema),
});
