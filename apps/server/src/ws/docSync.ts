import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zWorkspaceOp, type WorkspaceOp } from "@gm/shared";
import type { WorkspaceRepo } from "../repo/workspaceRepo";
import type WebSocket from "ws";

const zHello = z.object({
  type: z.literal("hello"),
  clientId: z.string().min(1),
  viewerId: z.string().min(1),
  workspaceId: z.string().min(1),
  afterSeq: z.number().int().nonnegative(),
});
const zClientOp = z.object({ type: z.literal("op"), op: zWorkspaceOp });

type ClientMsg = z.infer<typeof zHello> | z.infer<typeof zClientOp>;

type ServerMsg =
  | { type: "snapshot"; doc: unknown; serverSeq: number }
  | {
      type: "ops";
      ops: Array<{ serverSeq: number; op: WorkspaceOp }>;
      serverSeq: number;
    }
  | { type: "ack"; serverSeq: number; opId: string }
  | { type: "op"; serverSeq: number; op: WorkspaceOp };

export function registerDocSyncWs(app: FastifyInstance, repo: WorkspaceRepo) {
  const clientsByWorkspace = new Map<string, Set<WebSocket>>();

  function broadcast(workspaceId: string, msg: ServerMsg) {
    const set = clientsByWorkspace.get(workspaceId);
    if (!set) return;
    const payload = JSON.stringify(msg);
    // Avoid noisy logs on hot paths; keep details in tests and add targeted logging when debugging.
    for (const c of set) {
      try {
        c.send(payload);
      } catch {
        // ignore
      }
    }
  }

  // Workspace id is supplied by the initial `hello` message, not by URL params.
  // This avoids brittle param parsing in websocket test/inject contexts and mirrors Figma-like protocols.
  app.get("/ws/workspaces", { websocket: true }, (socket) => {
    let clientId: string | null = null;
    let viewerId: string | null = null;
    let workspaceId: string | null = null;

    socket.on("message", (raw: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(raw.toString()) as unknown;
        const msg: ClientMsg = z.union([zHello, zClientOp]).parse(parsed);

        if (msg.type === "hello") {
          clientId = msg.clientId;
          viewerId = msg.viewerId;
          workspaceId = msg.workspaceId;
          app.log.info({ workspaceId, clientId, viewerId }, "ws hello");

          if (!clientsByWorkspace.has(workspaceId))
            clientsByWorkspace.set(workspaceId, new Set());
          clientsByWorkspace.get(workspaceId)!.add(socket);

          const doc = repo.getWorkspace(workspaceId);
          if (!doc) {
            app.log.warn(
              { workspaceId, clientId },
              "ws hello for missing workspace"
            );
            closeSocket(socket);
            return;
          }

          const latest = repo.getLatestSeq(workspaceId);
          if (msg.afterSeq <= 0) {
            const out: ServerMsg = { type: "snapshot", doc, serverSeq: latest };
            try {
              socket.send(JSON.stringify(out));
            } catch (err) {
              app.log.error({ err, workspaceId }, "ws failed to send snapshot");
            }
          } else {
            const ops = repo.getOpsSince(workspaceId, msg.afterSeq);
            const out: ServerMsg = { type: "ops", ops, serverSeq: latest };
            try {
              socket.send(JSON.stringify(out));
            } catch (err) {
              app.log.error({ err, workspaceId }, "ws failed to send ops");
            }
          }
          return;
        }

        if (msg.type === "op") {
          if (!clientId || !viewerId || !workspaceId) {
            closeSocket(socket);
            return;
          }

          const acl = repo.getWorkspaceAcl(workspaceId);
          const canEdit = acl ? repo.canEditWorkspace(acl, viewerId) : false;
          if (!canEdit) {
            closeSocket(socket);
            return;
          }

          const now = new Date().toISOString();
          const result = repo.applyAndAppendOp({
            workspaceId,
            op: msg.op,
            now,
          });
          if (result.type === "not_found") {
            closeSocket(socket);
            return;
          }

          socket.send(
            JSON.stringify({
              type: "ack",
              serverSeq: result.serverSeq,
              opId: msg.op.opId,
            } satisfies ServerMsg)
          );
          broadcast(workspaceId, {
            type: "op",
            serverSeq: result.serverSeq,
            op: result.op,
          });
        }
      } catch {
        // ignore malformed
      }
    });

    socket.on("close", () => {
      if (!workspaceId) return;
      const set = clientsByWorkspace.get(workspaceId);
      if (!set) return;
      set.delete(socket);
      if (set.size === 0) clientsByWorkspace.delete(workspaceId);
    });
  });
}

function closeSocket(socket: unknown) {
  if (
    socket &&
    typeof socket === "object" &&
    "close" in socket &&
    typeof (socket as { close: () => void }).close === "function"
  ) {
    (socket as { close: () => void }).close();
    return;
  }
  if (
    socket &&
    typeof socket === "object" &&
    "terminate" in socket &&
    typeof (socket as { terminate: () => void }).terminate === "function"
  ) {
    (socket as { terminate: () => void }).terminate();
    return;
  }
  if (
    socket &&
    typeof socket === "object" &&
    "destroy" in socket &&
    typeof (socket as { destroy: () => void }).destroy === "function"
  ) {
    (socket as { destroy: () => void }).destroy();
  }
}
