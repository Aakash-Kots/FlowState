/**
 * Flatten a chat transcript into an ordered list of render items. A run of tool
 * calls spans several messages (assistant `tool_use` blocks, a separate
 * `tool`-role message carrying the `tool_result`s, then more `tool_use`s), so
 * the transcript is flattened across messages and re-segmented: maximal
 * contiguous runs of tool calls collapse into one `ToolGroup`; text/thinking
 * blocks break a run and stay inline; user/result messages render whole.
 */
import { ChatBlockType, ChatMessageRole, type ChatSnapshotEntry } from '@flowstate/shared';
import { ASK_USER_QUESTION_TOOL, EXIT_PLAN_MODE_TOOL } from '@/lib/constants/tools';
import { ChatItemKind } from '@/lib/enums/chat';
import type { ChatItem, ToolUseBlock } from '@/lib/types/chat';

////////////
// Export //
////////////

/**
 * Segment the conversation into render items. `toolUseIds` is the set of every
 * tool-call id in the transcript so a tool result whose call is known can be
 * dropped here (it renders inside that call's row); an orphan result still gets
 * its own fallback block.
 */
export function groupChatItems(entries: ChatSnapshotEntry[], toolUseIds: Set<string>): ChatItem[] {
  const items: ChatItem[] = [];
  let run: ToolUseBlock[] = [];

  const flush = () => {
    if (run.length === 0) return;
    // Key on the run's first tool-call id: stable as later calls append while
    // streaming, so the group doesn't remount and lose its open/collapse state.
    items.push({ kind: ChatItemKind.ToolGroup, key: `grp:${run[0].id}`, blocks: run });
    run = [];
  };

  for (const entry of entries) {
    const message = entry.message;
    if (message.role === ChatMessageRole.User || message.role === ChatMessageRole.Result) {
      flush();
      items.push({ kind: ChatItemKind.Message, key: message.id, entry });
      continue;
    }
    // assistant / tool messages: split blocks so tool runs merge across messages.
    message.blocks.forEach((block, i) => {
      switch (block.type) {
        case ChatBlockType.ToolUse:
          // AskUserQuestion is asked/answered near the input bar, not shown as a
          // transcript row; its paired result is suppressed via `toolUseIds`.
          // A subagent's call (parentToolUseId set) renders nested inside its
          // Task row, not as a top-level run — skip it here.
          if (block.name === ASK_USER_QUESTION_TOOL || block.parentToolUseId) break;
          // A proposed plan breaks the run and renders inline as its own markdown
          // message, not collapsed into the `▸ N tool calls` summary bar.
          if (block.name === EXIT_PLAN_MODE_TOOL) {
            flush();
            items.push({ kind: ChatItemKind.Plan, key: `plan:${block.id}`, block });
            break;
          }
          run.push(block);
          break;
        case ChatBlockType.ToolResult:
          // Paired results render inside their call's row; only orphans surface.
          if (!toolUseIds.has(block.toolUseId)) {
            flush();
            items.push({ kind: ChatItemKind.Block, key: `${message.id}:${i}`, block });
          }
          break;
        case ChatBlockType.Text:
        case ChatBlockType.Thinking:
          flush();
          items.push({ kind: ChatItemKind.Block, key: `${message.id}:${i}`, block });
          break;
      }
    });
  }
  flush();
  return items;
}
