import { z } from 'zod';
import { zWorkspaceDoc, type WorkspaceDoc } from '@gm/shared';

function withMockIdentity(url: string): string {
  const as = new URLSearchParams(window.location.search).get('as');
  if (!as) return url;
  const u = new URL(url, window.location.origin);
  u.searchParams.set('as', as);
  return u.pathname + u.search;
}

const zCopyResponse = z.object({ workspaceId: z.string().min(1), doc: zWorkspaceDoc });

export async function apiCopyWorkspace(args: {
  snapshotPayload?: string;
  sourceWorkspaceId?: string;
}): Promise<{ workspaceId: string; doc: WorkspaceDoc }> {
  const res = await fetch(withMockIdentity('/api/workspaces/copy'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`copy workspace failed: ${res.status}`);
  return zCopyResponse.parse(await res.json());
}
