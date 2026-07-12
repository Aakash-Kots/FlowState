/**
 * Linear integration types. Validation lives in `../schemas/linear`.
 */

/**
 * A Linear issue reference linked to a workspace. Kept intentionally small —
 * the full issue lives in Linear; FlowState stores just enough to display and
 * link back.
 */
export type LinearIssueRef = {
  id: string;
  identifier: string; // e.g. "ENG-142"
  title: string;
  url: string;
  stateName?: string;
};
