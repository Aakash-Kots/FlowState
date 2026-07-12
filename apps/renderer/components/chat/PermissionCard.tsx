'use client';

import { PermissionBehavior, type PermissionRequest } from '@flowstate/shared';
import { respondPermission } from '@/lib/chat';
import { Button } from '../ui/Button';

/** In-chat approve/deny prompt for a tool call awaiting permission. */
export function PermissionCard({ request }: { request: PermissionRequest }) {
  return (
    <div className="rounded-lg border border-warn/40 bg-raised p-3.5">
      <div className="mb-1 flex items-center gap-2">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
        <span className="text-sm font-medium text-neutral-100">
          {request.title ?? `Claude wants to use ${request.toolName}`}
        </span>
      </div>
      {request.description && <p className="mb-2 text-xs text-muted">{request.description}</p>}
      <pre className="mb-3 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-edge bg-surface p-2 font-mono text-xs text-neutral-300">
        {JSON.stringify(request.input, null, 2)}
      </pre>
      <div className="flex gap-2">
        <Button onClick={() => respondPermission(request.id, PermissionBehavior.Allow)}>
          Allow
        </Button>
        <Button
          variant="secondary"
          onClick={() => respondPermission(request.id, PermissionBehavior.Deny)}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}
