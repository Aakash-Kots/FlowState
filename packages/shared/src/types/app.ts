/**
 * App-level IPC bridge types shared with the renderer.
 */

/** App metadata surfaced to the renderer (proves the IPC bridge works). */
export type AppInfo = {
  name: string;
  version: string;
  platform: string; // NodeJS.Platform value, kept as string to stay node-type-free
};
