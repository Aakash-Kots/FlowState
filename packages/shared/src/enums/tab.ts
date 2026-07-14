/**
 * Enumerations for the tab domain, shared between the main process and the
 * renderer. Values are the wire strings, so they serialize over IPC and persist
 * to SQLite unchanged.
 */

/**
 * What a workspace tab holds. `Chat` is a Claude Code chat session (the original
 * and default kind); `File` is an in-tab code editor opened via the ⌘P finder,
 * pinned to a worktree-relative `filePath`.
 */
export enum TabKind {
  Chat = 'chat',
  File = 'file',
}
