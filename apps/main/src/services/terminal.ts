/**
 * TerminalService — spawns node-pty shells (one+ per workspace) and streams
 * data to xterm.js in the renderer over a dedicated high-throughput IPC channel.
 * Milestone 2. node-pty is a native module and is added in that milestone so
 * its Electron ABI rebuild is isolated from the initial scaffold.
 */
export class TerminalService {
  spawn(cwd: string): never {
    throw new Error(`TerminalService.spawn not implemented for ${cwd}`);
  }
}
