import type { z } from 'zod';
import type {
  claudeSessionStateSchema,
  createWorkspaceInputSchema,
  linearIssueRefSchema,
  workspaceSchema,
} from './schemas';

export type LinearIssueRef = z.infer<typeof linearIssueRefSchema>;
export type ClaudeSessionState = z.infer<typeof claudeSessionStateSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;

/** App metadata surfaced to the renderer (proves the IPC bridge works). */
export interface AppInfo {
  name: string;
  version: string;
  platform: string; // NodeJS.Platform value, kept as string to stay node-type-free
}
