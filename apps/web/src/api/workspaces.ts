import { z } from 'zod';
import { type WorkspaceDoc, zWorkspaceDoc } from '@gm/shared';

function withMockIdentity(url: string): string {
  const as = new URLSearchParams(window.location.search).get('as');
  if (!as) return url;
  const u = new URL(url, window.location.origin);
  u.searchParams.set('as', as);
  return u.pathname + u.search;
}

const zCreateResponse = z.object({
  workspaceId: z.string(),
  doc: zWorkspaceDoc,
});

const zGetResponse = z.object({
  workspaceId: z.string(),
  doc: zWorkspaceDoc,
  canEdit: z.boolean().optional(),
});

const zPutResponse = z.object({
  workspaceId: z.string(),
  doc: zWorkspaceDoc,
});

export async function apiCreateWorkspace(): Promise<{ workspaceId: string; doc: WorkspaceDoc }> {
  const res = await fetch(withMockIdentity('/api/workspaces'), { method: 'POST' });
  if (!res.ok) throw new Error(`create workspace failed: ${res.status}`);
  return zCreateResponse.parse(await res.json());
}

export async function apiGetWorkspace(
  workspaceId: string,
): Promise<{ workspaceId: string; doc: WorkspaceDoc; canEdit?: boolean }> {
  const res = await fetch(withMockIdentity(`/api/workspaces/${workspaceId}`));
  if (res.status === 404) throw new Error('workspace not found');
  if (!res.ok) throw new Error(`get workspace failed: ${res.status}`);
  return zGetResponse.parse(await res.json());
}

export async function apiSaveWorkspace(args: {
  workspaceId: string;
  expectedVersion: number;
  doc: WorkspaceDoc;
}): Promise<{ workspaceId: string; doc: WorkspaceDoc }> {
  const res = await fetch(withMockIdentity(`/api/workspaces/${args.workspaceId}`), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion: args.expectedVersion, doc: args.doc }),
  });

  if (res.status === 409) throw new Error('version conflict');
  if (!res.ok) throw new Error(`save workspace failed: ${res.status}`);
  return zPutResponse.parse(await res.json());
}
