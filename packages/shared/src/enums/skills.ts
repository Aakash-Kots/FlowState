/**
 * Enumerations for the pinned Skills & Actions panel. Values are the wire
 * strings, so they serialize over IPC and persist to SQLite unchanged.
 */

/** What a pinned panel item points at — a Claude skill or a built-in action. */
export enum PinnedItemKind {
  Skill = 'skill',
  Action = 'action',
}

/**
 * How a built-in Skills & Actions row behaves when clicked. `Prefill` drops a
 * canned prompt into the composer (e.g. "Commit & Push"); `ClearChat` runs an
 * in-app command directly (behind a confirmation) rather than sending a prompt.
 */
export enum BuiltinActionKind {
  Prefill = 'prefill',
  ClearChat = 'clear-chat',
}

/** Where an importable skill was discovered — a FlowState project, the user's global config, or a plugin marketplace. */
export enum SkillImportOrigin {
  Project = 'project',
  Global = 'global',
  Plugin = 'plugin',
}
