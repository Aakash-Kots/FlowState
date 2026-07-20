/**
 * The tool registry for the on-device Gemma loop, plus `buildToolFunctions`,
 * which adapts each tool into a node-llama-cpp function-calling handler.
 *
 * Each tool binds a GBNF-JSON param schema (constrains the model's arguments) to
 * a zod validator (re-checks them at the execution boundary) and an effect that
 * reuses the same singleton services the tRPC routers do (`linearService`,
 * `createWorkspace`). Side-effecting tools are gated: the handler asks the host
 * (`hooks.gate`) for confirmation and only runs on approval, so an accidental or
 * hallucinated call can never create a ticket or worktree without the user's OK.
 *
 * Tools return a short human-readable summary string; that string is both fed
 * back to the model (so it can continue the turn) and streamed to the palette as
 * the tool-result line.
 */
import type {
  ChatSessionModelFunction,
  ChatSessionModelFunctions,
  GbnfJsonSchema,
} from 'node-llama-cpp';
import { z } from 'zod';
import {
  createLinearIssueInputSchema,
  type GemmaToolCall,
  type GemmaToolResult,
  type LinearIssueRef,
} from '@flowstate/shared';
import { LocalToolName } from '../lib/enums/local-tools';
import type { LocalTool, ToolContext } from '../lib/types/local-tools';
import { linearService } from './linear';
import { createWorkspace } from './workspaceCreate';

///////////
// Types //
///////////

type Lib = typeof import('node-llama-cpp');
type DefineFn = Lib['defineChatSessionFunction'];

/** The host's answer to a gated tool call: whether it may run, and (when the
 * user edited the confirmation card) the args to run with. */
export type ToolDecision = {
  approved: boolean;
  args?: Record<string, unknown>;
};

/** Callbacks the tool loop uses to talk to the host (GemmaService): mint a call
 * id, gate a call (confirm side-effecting ones), and report the outcome. */
export type ToolHooks = {
  nextId: () => string;
  gate: (call: GemmaToolCall) => Promise<ToolDecision>;
  onResult: (result: GemmaToolResult) => void;
};

/////////////
// Helpers //
/////////////

/** A nullable-string GBNF field — the model emits `null` to omit it (GBNF has no
 * optional properties; every listed key is required). */
const optionalString = (description: string): GbnfJsonSchema => ({
  type: ['string', 'null'],
  description,
});

/** Tie a tool's arg type to its zod schema + handlers; the `as Args` casts are
 * safe because the loop always `parse`s (producing Args) before summarize/execute. */
function defineTool<Args>(config: {
  name: LocalToolName;
  description: string;
  params: GbnfJsonSchema;
  sideEffecting: boolean;
  zodSchema: z.ZodType<Args>;
  summarize: (args: Args) => string;
  execute: (args: Args, ctx: ToolContext) => Promise<string>;
}): LocalTool {
  return {
    name: config.name,
    description: config.description,
    params: config.params,
    sideEffecting: config.sideEffecting,
    parse: (raw) => config.zodSchema.parse(raw),
    summarize: (args) => config.summarize(args as Args),
    execute: (args, ctx) => config.execute(args as Args, ctx),
  };
}

/** Coalesce a nullable/absent string to a trimmed value or undefined. */
const clean = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

//////////////////////////
// Tool implementations //
//////////////////////////

const listLinearTeams = defineTool({
  name: LocalToolName.ListLinearTeams,
  description:
    'List the Linear teams the user belongs to. Call this first to get a teamId before creating a ticket.',
  params: { type: 'object', properties: {} },
  sideEffecting: false,
  zodSchema: z.object({}),
  summarize: () => 'List Linear teams',
  execute: async () => {
    const teams = await linearService.teams();
    if (teams.length === 0) return 'No Linear teams found.';
    return teams.map((t) => `${t.key} — ${t.name} (teamId: ${t.id})`).join('\n');
  },
});

const listWorkflowStates = defineTool({
  name: LocalToolName.ListWorkflowStates,
  description:
    "List a Linear team's workflow states (e.g. Todo, In Progress, Done) with their ids, for setting a ticket's state.",
  params: {
    type: 'object',
    properties: { teamId: { type: 'string', description: 'The Linear team id.' } },
  },
  sideEffecting: false,
  zodSchema: z.object({ teamId: z.string().min(1) }),
  summarize: () => 'List Linear workflow states',
  execute: async (args) => {
    const states = await linearService.workflowStates(args.teamId);
    if (states.length === 0) return 'No workflow states found for that team.';
    return states.map((s) => `${s.name} (stateId: ${s.id})`).join('\n');
  },
});

const searchLinearIssues = defineTool({
  name: LocalToolName.SearchLinearIssues,
  description:
    'Search the user\'s Linear issues by text. Returns matching tickets with their identifiers and ids. Read-only.',
  params: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Text to search issue titles for.' } },
  },
  sideEffecting: false,
  zodSchema: z.object({ query: z.string().min(1) }),
  summarize: (args) => `Search Linear for "${args.query}"`,
  execute: async (args) => {
    const issues = await linearService.issues({ query: args.query });
    if (issues.length === 0) return `No Linear issues match "${args.query}".`;
    return issues
      .slice(0, 8)
      .map((i) => `${i.identifier}: ${i.title} [${i.state.name}] (issueId: ${i.id})`)
      .join('\n');
  },
});

const createLinearTicket = defineTool({
  name: LocalToolName.CreateLinearTicket,
  description:
    'Create a Linear ticket. Requires a teamId (get one from list_linear_teams first). Requires user confirmation.',
  params: {
    type: 'object',
    properties: {
      teamId: { type: 'string', description: 'The Linear team id to create the ticket in.' },
      title: { type: 'string', description: 'The ticket title.' },
      description: optionalString('Optional markdown body, or null.'),
    },
  },
  sideEffecting: true,
  zodSchema: z.object({
    teamId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().nullish(),
  }),
  summarize: (args) => `Create Linear ticket "${args.title}"`,
  execute: async (args) => {
    const input = createLinearIssueInputSchema.parse({
      teamId: args.teamId,
      title: args.title,
      description: clean(args.description),
    });
    const issue = await linearService.createIssue(input);
    return `Created ${issue.identifier}: ${issue.title} — ${issue.url}`;
  },
});

const createWorktreeTool = defineTool({
  name: LocalToolName.CreateWorktree,
  description:
    'Create a new worktree/workspace in a project (a git worktree on its own branch, its terminals, and a Claude session). Defaults to the active project. Requires user confirmation.',
  params: {
    type: 'object',
    properties: {
      projectId: optionalString('Project id to create the worktree in, or null for the active project.'),
      initialPrompt: optionalString('Optional first instruction to seed the Claude session with, or null.'),
    },
  },
  sideEffecting: true,
  zodSchema: z.object({
    projectId: z.string().nullish(),
    initialPrompt: z.string().nullish(),
  }),
  summarize: () => 'Create a new worktree',
  execute: async (args, ctx) => {
    const projectId = clean(args.projectId) ?? ctx.activeProjectId ?? null;
    if (!projectId) throw new Error('No project specified and no active project to default to.');
    const { workspace } = await createWorkspace({
      projectId,
      initialPrompt: clean(args.initialPrompt),
    });
    return `Created a worktree on branch ${workspace.branch}.`;
  },
});

const linkTicketToWorktree = defineTool({
  name: LocalToolName.LinkTicketToWorktree,
  description:
    'Create a Linear ticket AND a worktree linked to it in one step — the ticket context seeds the new Claude session. Requires a teamId. Defaults to the active project. Requires user confirmation.',
  params: {
    type: 'object',
    properties: {
      teamId: { type: 'string', description: 'The Linear team id to create the ticket in.' },
      title: { type: 'string', description: 'The ticket title.' },
      description: optionalString('Optional markdown body, or null.'),
      projectId: optionalString('Project id for the worktree, or null for the active project.'),
    },
  },
  sideEffecting: true,
  zodSchema: z.object({
    teamId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().nullish(),
    projectId: z.string().nullish(),
  }),
  summarize: (args) => `Create ticket "${args.title}" + a linked worktree`,
  execute: async (args, ctx) => {
    const projectId = clean(args.projectId) ?? ctx.activeProjectId ?? null;
    if (!projectId) throw new Error('No project specified and no active project to default to.');
    const input = createLinearIssueInputSchema.parse({
      teamId: args.teamId,
      title: args.title,
      description: clean(args.description),
    });
    const issue = await linearService.createIssue(input);
    const ref: LinearIssueRef = {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      branchName: issue.branchName,
      stateName: issue.state.name,
    };
    const { workspace } = await createWorkspace({ projectId, linearIssue: ref });
    return `Created ${issue.identifier} and a linked worktree on branch ${workspace.branch}.`;
  },
});

///////////////
// Registry  //
///////////////

/** Every tool the Ask palette exposes to the model, read-only first. */
export const LOCAL_TOOLS: LocalTool[] = [
  listLinearTeams,
  listWorkflowStates,
  searchLinearIssues,
  createLinearTicket,
  createWorktreeTool,
  linkTicketToWorktree,
];

/**
 * Adapt the registry into node-llama-cpp function-calling handlers bound to this
 * turn's `ctx` and `hooks`. Each handler validates the model's args, gates the
 * call (auto-approving read-only tools), runs the effect, and returns a summary
 * string to the model — turning any failure into an error string the model can
 * recover from rather than throwing out of the generation.
 */
export function buildToolFunctions(
  define: DefineFn,
  ctx: ToolContext,
  hooks: ToolHooks,
): ChatSessionModelFunctions {
  // We drive each handler manually, so `define`'s param/return inference buys us
  // nothing and its `const Params` generic rejects our runtime-built schemas —
  // narrow it to a plain, non-generic factory.
  const defineFn = define as unknown as (config: {
    description: string;
    params: GbnfJsonSchema;
    handler: (args: unknown) => Promise<string>;
  }) => ChatSessionModelFunction;

  const functions: Record<string, ChatSessionModelFunction> = {};
  for (const tool of LOCAL_TOOLS) {
    functions[tool.name] = defineFn({
      description: tool.description,
      params: tool.params,
      handler: async (rawArgs: unknown): Promise<string> => {
        const id = hooks.nextId();
        let args: unknown;
        try {
          args = tool.parse(rawArgs);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid arguments.';
          hooks.onResult({ id, name: tool.name, ok: false, summary: `Rejected: ${message}` });
          return `Error: ${message}. Fix the arguments and try again.`;
        }

        const call: GemmaToolCall = {
          id,
          name: tool.name,
          title: tool.summarize(args),
          args: (args ?? {}) as Record<string, unknown>,
          needsConfirmation: tool.sideEffecting,
        };
        const decision = await hooks.gate(call);
        if (!decision.approved) {
          hooks.onResult({ id, name: tool.name, ok: false, summary: 'Denied by the user.' });
          return 'The user denied this action. Do not retry it — ask how they would like to proceed.';
        }

        try {
          const summary = await tool.execute(decision.args ?? args, ctx);
          hooks.onResult({ id, name: tool.name, ok: true, summary });
          return summary;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'The tool failed.';
          hooks.onResult({ id, name: tool.name, ok: false, summary: message });
          return `Error: ${message}`;
        }
      },
    });
  }
  return functions;
}
