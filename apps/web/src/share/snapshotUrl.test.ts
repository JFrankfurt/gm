import { describe, expect, it } from 'vitest';
import { decodeDocFromSnapshotPayload, encodeDocToSnapshotPayload } from './snapshotUrl';
import { createEmptyWorkspaceDoc } from '@gm/shared';

describe('snapshotUrl', () => {
  it('encode/decode roundtrip', async () => {
    const now = new Date(0).toISOString();
    const doc = createEmptyWorkspaceDoc({ workspaceId: 'w1', now });
    const payload = await encodeDocToSnapshotPayload(doc);
    const decoded = await decodeDocFromSnapshotPayload(payload);
    expect(decoded).toMatchObject({ workspaceId: 'w1' });
    expect(decoded.viewport.zoom).toBe(1);
  });
});
