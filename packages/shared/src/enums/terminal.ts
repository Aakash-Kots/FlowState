/**
 * Enumerations for the terminal domain, shared between the main process and the
 * renderer. Values are the wire strings, so they serialize over IPC and persist
 * to SQLite unchanged.
 */

/**
 * What a terminal tab is for. `Setup` and `Run` are the two always-present,
 * non-closable default tabs whose command comes from the project's scripts;
 * `Shell` tabs are the ad-hoc terminals the user opens.
 */
export enum TerminalKind {
  Setup = 'setup',
  Run = 'run',
  Shell = 'shell',
}
