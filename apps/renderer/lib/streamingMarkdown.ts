/**
 * Splits a streaming assistant reply into the part that can no longer change and the
 * part still being written, so the transcript only re-parses the tail.
 *
 * Without this, `StreamingBubble` hands the whole accumulated reply to ReactMarkdown
 * ~15x/second: each parse is O(n) over a string that keeps growing, so rendering one
 * long reply costs O(n²) and it is the dominant renderer cost during a turn. Feeding
 * the settled prefix in as a referentially stable string instead lets `Markdown`'s
 * `memo` skip it outright, leaving only a short tail to re-parse each frame.
 *
 * The split must never land somewhere that changes how the text renders, so a boundary
 * is only accepted where the tail provably cannot continue a construct the prefix
 * started. When nothing qualifies the whole reply stays in `tail` and behaviour is
 * exactly what it was before.
 */
import type { StreamingSplit } from './types/chat';

///////////////
// Constants //
///////////////

/** Opens a fenced code block: up to 3 spaces, then 3+ backticks or tildes. */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** Closes one: the same run, with nothing but whitespace after it (a closing fence may
 * not carry an info string, which is what lets ```` ``` ```` sit inside a ```` ```` ```` block). */
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})\s*$/;

/**
 * A line belonging to a construct that survives a blank line — an indented code block
 * or nested continuation (leading whitespace), a list item, or a blockquote. A blank
 * line between two such lines may be interior to one construct, so it is only a safe
 * boundary when the line *before* it is not one of these (a list after a paragraph is
 * genuinely a new list; a list item after another list item is not).
 */
const CONTINUATION_RE = /^(\s|[-*+]\s|\d+[.)]\s|>)/;

/**
 * A link reference definition (`[label]: /url`). These resolve across the whole
 * document, so a definition in the prefix would stop resolving for a link in the
 * tail once the two are parsed separately. Rare in assistant output, and cheap to
 * detect, so we simply decline to split when one is present.
 */
const LINK_DEF_RE = /^ {0,3}\[[^\]]+\]:/m;

/////////////
// Helpers //
/////////////

/** True for a line that is empty or only whitespace. */
function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

//////////////////////////
// splitStreamingMarkdown //
//////////////////////////

/**
 * Cut `text` at the last blank line that is outside a fenced code block and is followed
 * by an unambiguous fresh block. Returns `{ stable: '', tail: text }` when no such
 * boundary exists — a short reply, or one long unterminated fence.
 *
 * `stable` always ends with the blank line, so concatenating `stable + tail` reproduces
 * the input exactly.
 */
export function splitStreamingMarkdown(text: string): StreamingSplit {
  if (!text || LINK_DEF_RE.test(text)) return { stable: '', tail: text };

  const lines = text.split('\n');

  // Fence state, tracked across the whole scan so a blank line inside a code block is
  // never mistaken for a boundary. `fence` is the marker char of the open fence and
  // `fenceLen` its length — a fence only closes on a run of the same char at least as
  // long, which is what lets a ```` ``` ```` sit inside a ```` ```` ```` block.
  let fence: string | null = null;
  let fenceLen = 0;

  // Byte offset of the start of the current line, and the end offset of the best
  // boundary found so far (-1 for none).
  let offset = 0;
  let boundary = -1;
  // Last non-blank line seen outside a fence, so a candidate can tell whether the
  // construct starting after the blank could be continuing one already open.
  let prev = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (fence === null) {
      const open = FENCE_RE.exec(line);
      if (open) {
        fence = open[1][0];
        fenceLen = open[1].length;
      } else if (isBlank(line)) {
        // Candidate: safe when the next block cannot continue the previous one.
        //
        // Only a *complete* line can decide that. The final line of a streaming buffer
        // is still being typed, so a lone "-" may be the start of "- item" rather than
        // a thematic break — judging by it would split a list in two for one frame and
        // then have to undo it. `j < lines.length - 1` means line j was newline-
        // terminated, which is the cheapest proof that it is finished.
        for (let j = i + 1; j < lines.length - 1; j++) {
          const next = lines[j] ?? '';
          if (isBlank(next)) continue;
          if (!CONTINUATION_RE.test(next) || !CONTINUATION_RE.test(prev)) {
            boundary = offset + line.length + 1;
          }
          break;
        }
      } else {
        prev = line;
      }
    } else {
      const close = FENCE_CLOSE_RE.exec(line);
      if (close && close[1][0] === fence && close[1].length >= fenceLen) {
        fence = null;
        fenceLen = 0;
      }
    }

    offset += line.length + 1; // +1 for the '\n' consumed by split
  }

  if (boundary <= 0 || boundary >= text.length) return { stable: '', tail: text };
  return { stable: text.slice(0, boundary), tail: text.slice(boundary) };
}
