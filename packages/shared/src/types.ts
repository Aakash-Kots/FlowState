import type { z } from 'zod';
import type {
  chatBlockSchema,
  chatEventSchema,
  chatMessageSchema,
  chatSnapshotSchema,
  claudeMessageSchema,
  claudeSessionStateSchema,
  createWorkspaceInputSchema,
  linearIssueRefSchema,
  permissionRequestSchema,
  workspaceSchema,
} from './schemas';

export type LinearIssueRef = z.infer<typeof linearIssueRefSchema>;
export type ClaudeSessionState = z.infer<typeof claudeSessionStateSchema>;
export type ClaudeMessage = z.infer<typeof claudeMessageSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;
export type ChatBlock = z.infer<typeof chatBlockSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatEvent = z.infer<typeof chatEventSchema>;
export type ChatSnapshot = z.infer<typeof chatSnapshotSchema>;
export type PermissionRequest = z.infer<typeof permissionRequestSchema>;

/** App metadata surfaced to the renderer (proves the IPC bridge works). */
export interface AppInfo {
  name: string;
  version: string;
  platform: string; // NodeJS.Platform value, kept as string to stay node-type-free
}
