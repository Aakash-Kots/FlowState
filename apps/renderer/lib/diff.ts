/**
 * Builds unified-diff patch strings for the chat Edit/MultiEdit tool previews.
 * The Claude Edit tool only reports the `old_string`/`new_string` fragments it
 * replaced (never the whole file), so we diff those fragments directly with
 * jsdiff and emit only the hunk bodies — the exact shape `DiffView` renders.
 */
import { structuredPatch } from 'diff';
import type { DiffStat } from './types/diff';

/////////////
// Helpers //
/////////////

/** A single before→after replacement, as reported by an Edit/MultiEdit call. */
type Replacement = { oldString: string; newString: string };

/** Serialize jsdiff hunks to unified-diff text (hunk headers + body lines only,
 * no `Index:`/`---`/`+++` file headers — `DiffView` numbers from the `@@`s). */
function hunksToPatch(hunks: ReturnType<typeof structuredPatch>['hunks']): string {
  const out: string[] = [];
  for (const h of hunks) {
    out.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
    out.push(...h.lines);
  }
  return out.join('\n');
}

////////////
// Export //
////////////

/** Unified-diff patch for one Edit's `old_string`→`new_string` replacement. */
export function buildEditPatch(filePath: string, oldString: string, newString: string): string {
  const { hunks } = structuredPatch(filePath, filePath, oldString, newString, '', '', { context: 3 });
  return hunksToPatch(hunks);
}

/** Unified-diff patch for a MultiEdit — one hunk group per replacement, in order. */
export function buildMultiEditPatch(filePath: string, edits: Replacement[]): string {
  return edits
    .map((e) => buildEditPatch(filePath, e.oldString, e.newString))
    .filter(Boolean)
    .join('\n');
}

/** Added/removed line counts for one Edit's `old_string`→`new_string` replacement,
 * derived from the same jsdiff hunks the preview renders. */
export function editDiffStat(oldString: string, newString: string): DiffStat {
  // File path is irrelevant to the line counts — pass a placeholder.
  const { hunks } = structuredPatch('f', 'f', oldString, newString, '', '', { context: 0 });
  let added = 0;
  let removed = 0;
  for (const h of hunks) {
    for (const line of h.lines) {
      if (line.startsWith('+')) added++;
      else if (line.startsWith('-')) removed++;
    }
  }
  return { added, removed };
}

/** Added/removed line counts for a MultiEdit — the sum across its replacements. */
export function multiEditDiffStat(edits: Replacement[]): DiffStat {
  return edits.reduce<DiffStat>(
    (acc, e) => {
      const s = editDiffStat(e.oldString, e.newString);
      return { added: acc.added + s.added, removed: acc.removed + s.removed };
    },
    { added: 0, removed: 0 },
  );
}

/** Added-line count for a Write — every line of new content is an addition. A
 * single trailing newline doesn't count as its own line. */
export function writeDiffStat(content: string): DiffStat {
  if (content.length === 0) return { added: 0, removed: 0 };
  const body = content.endsWith('\n') ? content.slice(0, -1) : content;
  return { added: body.split('\n').length, removed: 0 };
}
