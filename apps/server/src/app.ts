import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { type WorkspaceDoc, zWorkspaceDoc } from "@gm/shared";
import { createWorkspaceRepo } from "./repo/workspaceRepo";
import { registerDocSyncWs } from "./ws/docSync";
import { registerMarketDataSse } from "./sse/marketData";
import { getIdentityFromQuery } from "./auth/identity";
import { decodeWorkspaceDocFromSnapshotPayload } from "./share/snapshotPayload";
import { registerExecutionsSse } from "./sse/executions";
import { isMarketEntitled } from "./sse/entitlements";
import { publishExecution } from "./sse/executionBus";
import { registerHyperliquidSse } from "./sse/hyperliquid";
import { registerHyperliquidInfo } from "./hyperliquid/info";
import { registerWorkspacesList } from "./api/workspacesList";

export type BuildAppOptions = {
  dbPath: string;
};

export function buildApp(opts: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  const repo = createWorkspaceRepo({ dbPath: opts.dbPath });
  registerMarketDataSse(app);
  registerExecutionsSse(app);
  registerHyperliquidSse(app);
  registerHyperliquidInfo(app);
  registerWorkspacesList(app, repo);
  // Fastify plugins are encapsulated; register websocket + ws routes in the same scope
  // so the `websocket: true` route option is honored.
  app.register(async (wsScope) => {
    await wsScope.register(websocket);
    registerDocSyncWs(wsScope, repo);
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/workspaces", async (req, reply) => {
    const identity = getIdentityFromQuery(req.query);
    const now = new Date().toISOString();
    const { workspaceId, doc } = repo.createWorkspace({
      workspaceId: crypto.randomUUID(),
      now,
      ownerId: identity.viewerId,
    });
    reply.code(201);
    return { workspaceId, doc };
  });

  app.get("/api/workspaces/:id", async (req, reply) => {
    const identity = getIdentityFromQuery(req.query);
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const found = repo.getWorkspace(params.id);
    if (!found) {
      reply.code(404);
      return { error: "not_found" };
    }
    const acl = repo.getWorkspaceAcl(params.id);
    const canEdit = acl ? repo.canEditWorkspace(acl, identity.viewerId) : false;
    return { workspaceId: params.id, doc: found, canEdit };
  });

  const zPutBody = z.object({
    expectedVersion: z.number().int().nonnegative(),
    doc: zWorkspaceDoc,
  });

  app.put("/api/workspaces/:id", async (req, reply) => {
    const identity = getIdentityFromQuery(req.query);
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = zPutBody.parse(req.body);

    // Ensure URL id is canonical.
    if (body.doc.workspaceId !== params.id) {
      reply.code(400);
      return { error: "workspace_id_mismatch" };
    }

    const acl = repo.getWorkspaceAcl(params.id);
    const canEdit = acl ? repo.canEditWorkspace(acl, identity.viewerId) : false;
    if (!canEdit) {
      reply.code(403);
      return { error: "forbidden" };
    }

    const now = new Date().toISOString();
    const result = repo.saveWorkspace({
      workspaceId: params.id,
      expectedVersion: body.expectedVersion,
      doc: body.doc,
      now,
    });

    if (result.type === "not_found") {
      reply.code(404);
      return { error: "not_found" };
    }

    if (result.type === "version_conflict") {
      reply.code(409);
      return { error: "version_conflict", current: result.current };
    }

    return { workspaceId: params.id, doc: result.saved };
  });

  app.post("/api/workspaces/copy", async (req, reply) => {
    const identity = getIdentityFromQuery(req.query);
    const body = z
      .object({
        snapshotPayload: z.string().min(1).optional(),
        sourceWorkspaceId: z.string().min(1).optional(),
      })
      .parse(req.body);

    const now = new Date().toISOString();
    const nextId = crypto.randomUUID();

    let sourceDoc: WorkspaceDoc | null = null;
    if (body.snapshotPayload) {
      sourceDoc = decodeWorkspaceDocFromSnapshotPayload(body.snapshotPayload);
    } else if (body.sourceWorkspaceId) {
      sourceDoc = repo.getWorkspace(body.sourceWorkspaceId);
    }

    if (!sourceDoc) {
      reply.code(400);
      return { error: "missing_source" };
    }

    // Seed new workspace from source layout, but ensure new identity/metadata.
    const seeded: WorkspaceDoc = {
      ...sourceDoc,
      workspaceId: nextId,
      version: 0,
      createdAt: now,
      updatedAt: now,
      selection: [],
    };

    const created = repo.createWorkspaceWithDoc({
      workspaceId: nextId,
      now,
      ownerId: identity.viewerId,
      doc: seeded,
    });
    reply.code(201);
    return { workspaceId: created.workspaceId, doc: created.doc };
  });

  app.post("/api/orders", async (req, reply) => {
    const identity = getIdentityFromQuery(req.query);
    const body = z
      .object({
        symbol: z.string().min(1),
        side: z.enum(["buy", "sell"]),
        qty: z.number().positive(),
        price: z.number().positive().optional(),
      })
      .parse(req.body);

    if (!isMarketEntitled({ viewerId: identity.viewerId, symbol: body.symbol })) {
      reply.code(403);
      return { error: "forbidden" };
    }

    const now = Date.now();
    const exec = {
      type: "execution" as const,
      symbol: body.symbol,
      viewerId: identity.viewerId,
      ts: now,
      side: body.side,
      qty: body.qty,
      price: body.price ?? 100_000,
      orderId: crypto.randomUUID(),
    };
    publishExecution(exec);
    reply.code(201);
    return { ok: true, execution: exec };
  });

  return app;
}
