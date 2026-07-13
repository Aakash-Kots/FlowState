/**
 * Builds unified-diff patch strings for the chat Edit/MultiEdit tool previews.
 * The Claude Edit tool only reports the `old_string`/`new_string` fragments it
 * replaced (never the whole file), so we diff those fragments directly with
 * jsdiff and emit only the hunk bodies — the exact shape `DiffView` renders.
 */
import { structuredPatch } from 'diff';

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
