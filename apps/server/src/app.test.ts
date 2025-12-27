import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app';

describe('workspace API roundtrip', () => {
  it('creates, gets, saves, and re-gets a workspace doc', async () => {
    const dbPath = path.join(os.tmpdir(), `gm-test-${crypto.randomUUID()}.sqlite3`);
    const app = buildApp({ dbPath });

    const createRes = await app.inject({ method: 'POST', url: '/api/workspaces?as=userA' });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as { workspaceId: string; doc: { version: number } };
    expect(created.workspaceId).toBeTruthy();
    expect(created.doc.version).toBe(0);

    const getRes = await app.inject({ method: 'GET', url: `/api/workspaces/${created.workspaceId}?as=userA` });
    expect(getRes.statusCode).toBe(200);
    const got = getRes.json() as { workspaceId: string; doc: { version: number; workspaceId: string } };
    expect(got.doc.workspaceId).toBe(created.workspaceId);
    expect(got.doc.version).toBe(0);

    const now = new Date().toISOString();
    const toSave = {
      ...got.doc,
      updatedAt: now,
      selection: [],
    };
    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/workspaces/${created.workspaceId}?as=userA`,
      payload: { expectedVersion: got.doc.version, doc: toSave },
    });
    expect(putRes.statusCode).toBe(200);
    const saved = putRes.json() as { doc: { version: number } };
    expect(saved.doc.version).toBe(1);

    const conflictRes = await app.inject({
      method: 'PUT',
      url: `/api/workspaces/${created.workspaceId}?as=userA`,
      payload: { expectedVersion: 0, doc: toSave },
    });
    expect(conflictRes.statusCode).toBe(409);
  });

  it('copy creates a new workspace owned by the caller', async () => {
    const dbPath = path.join(os.tmpdir(), `gm-copy-test-${crypto.randomUUID()}.sqlite3`);
    const app = buildApp({ dbPath });

    const createRes = await app.inject({ method: 'POST', url: '/api/workspaces?as=userA' });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as { workspaceId: string; doc: { workspaceId: string } };

    const copyRes = await app.inject({
      method: 'POST',
      url: '/api/workspaces/copy?as=userB',
      payload: { sourceWorkspaceId: created.workspaceId },
    });
    expect(copyRes.statusCode).toBe(201);
    const copied = copyRes.json() as { workspaceId: string; doc: { workspaceId: string } };
    expect(copied.workspaceId).not.toBe(created.workspaceId);
    expect(copied.doc.workspaceId).toBe(copied.workspaceId);
  });

  it('market and executions streams are entitlement-gated', async () => {
    const dbPath = path.join(os.tmpdir(), `gm-ent-test-${crypto.randomUUID()}.sqlite3`);
    const app = buildApp({ dbPath });
    await app.ready();

    const marketForbidden = await app.inject({
      method: 'GET',
      url: '/api/market/stream?symbol=ETH-USD&as=userA',
    });
    expect(marketForbidden.statusCode).toBe(200);
    expect(marketForbidden.body).toContain('event: gm_error');
    expect(marketForbidden.body).toContain('"code":"forbidden"');

    const execForbidden = await app.inject({
      method: 'GET',
      url: '/api/executions/stream?symbol=ETH-USD&as=userA',
    });
    expect(execForbidden.statusCode).toBe(200);
    expect(execForbidden.body).toContain('event: gm_error');
    expect(execForbidden.body).toContain('"code":"forbidden"');

    await app.close();
  });

  it('orders are entitlement-gated', async () => {
    const dbPath = path.join(os.tmpdir(), `gm-order-test-${crypto.randomUUID()}.sqlite3`);
    const app = buildApp({ dbPath });
    await app.ready();

    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/orders?as=userA',
      payload: { symbol: 'ETH-USD', side: 'buy', qty: 1 },
    });
    expect(forbidden.statusCode).toBe(403);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/orders?as=userA',
      payload: { symbol: 'BTC-USD', side: 'buy', qty: 1 },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().ok).toBe(true);

    await app.close();
  });
});


