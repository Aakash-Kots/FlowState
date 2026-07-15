/**
 * Flatten a chat transcript into an ordered list of render items. A turn spans
 * several messages (assistant `tool_use` blocks, a separate `tool`-role message
 * carrying the `tool_result`s, then more `tool_use`s), so the transcript is
 * flattened across messages: each tool call becomes its own inline `Tool` row,
 * text/thinking blocks render inline, and user/result messages render whole.
 * Subagent calls (`parentToolUseId` set) are flattened into the stream too, in
 * transcript order, so nothing nests.
 */
import { ChatBlockType, ChatMessageRole, type ChatSnapshotEntry } from '@flowstate/shared';
import { ASK_USER_QUESTION_TOOL, EXIT_PLAN_MODE_TOOL } from '@/lib/constants/tools';
import { ChatItemKind } from '@/lib/enums/chat';
import type { ChatItem } from '@/lib/types/chat';

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

  for (const entry of entries) {
    const message = entry.message;
    if (message.role === ChatMessageRole.User || message.role === ChatMessageRole.Result) {
      items.push({ kind: ChatItemKind.Message, key: message.id, entry });
      continue;
    }
    // assistant / tool messages: split blocks so each renders as its own item.
    message.blocks.forEach((block, i) => {
      switch (block.type) {
        case ChatBlockType.ToolUse:
          // AskUserQuestion is asked/answered near the input bar, not shown as a
          // transcript row; its paired result is suppressed via `toolUseIds`.
          if (block.name === ASK_USER_QUESTION_TOOL) break;
          // A proposed plan renders inline as its own markdown message.
          if (block.name === EXIT_PLAN_MODE_TOOL) {
            items.push({ kind: ChatItemKind.Plan, key: `plan:${block.id}`, block });
            break;
          }
          items.push({ kind: ChatItemKind.Tool, key: `tool:${block.id}`, block });
          break;
        case ChatBlockType.ToolResult:
          // Paired results render inside their call's row; only orphans surface.
          if (!toolUseIds.has(block.toolUseId)) {
            items.push({ kind: ChatItemKind.Block, key: `${message.id}:${i}`, block });
          }
          break;
        case ChatBlockType.Text:
        case ChatBlockType.Thinking:
          items.push({ kind: ChatItemKind.Block, key: `${message.id}:${i}`, block });
          break;
      }
    });
  }
  return items;
}
