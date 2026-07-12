'use client';

import { createTRPCProxyClient } from '@trpc/client';
import { ipcLink } from 'electron-trpc/renderer';
import type { AppRouter } from '@main/router';

// Lazily created so the client is only instantiated in the browser/Electron
// context (never during Next's static prerender, where there is no IPC bridge).
let client: ReturnType<typeof createTRPCProxyClient<AppRouter>> | null = null;

export function trpc(): ReturnType<typeof createTRPCProxyClient<AppRouter>> {
  if (!client) {
    client = createTRPCProxyClient<AppRouter>({ links: [ipcLink()] });
  }
  return client;
}
