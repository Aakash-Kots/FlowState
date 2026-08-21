/**
 * Names of the tools the Gemini "Ask" model can call (main-process only — the
 * renderer only ever sees these as opaque wire strings on a `ToolCall` event).
 * Values are the function names handed to Gemini's function calling, so keep
 * them snake_case and stable.
 */
export enum LocalToolName {
  ListLinearTeams = 'list_linear_teams',
  ListWorkflowStates = 'list_workflow_states',
  SearchLinearIssues = 'search_linear_issues',
  CreateLinearTicket = 'create_linear_ticket',
  CreateWorktree = 'create_worktree',
  LinkTicketToWorktree = 'link_ticket_to_worktree',
}
