import { z } from "zod";
import {
  type WorkspaceDoc,
  type WorkspaceOp,
  zWorkspaceDoc,
  zWorkspaceOp,
} from "@gm/shared";

const zServerSnapshot = z.object({
  type: z.literal("snapshot"),
  doc: zWorkspaceDoc,
  serverSeq: z.number().int().nonnegative(),
});
const zServerOps = z.object({
  type: z.literal("ops"),
  ops: z.array(
    z.object({ serverSeq: z.number().int().nonnegative(), op: zWorkspaceOp })
  ),
  serverSeq: z.number().int().nonnegative(),
});
const zServerAck = z.object({
  type: z.literal("ack"),
  serverSeq: z.number().int().nonnegative(),
  opId: z.string().min(1),
});
const zServerOp = z.object({
  type: z.literal("op"),
  serverSeq: z.number().int().nonnegative(),
  op: zWorkspaceOp,
});

const zServerMsg = z.union([
  zServerSnapshot,
  zServerOps,
  zServerAck,
  zServerOp,
]);

export type DocSyncEvents = {
  onSnapshot: (doc: WorkspaceDoc, serverSeq: number) => void;
  onRemoteOp: (op: WorkspaceOp, serverSeq: number) => void;
  onAck: (opId: string, serverSeq: number) => void;
  onStatus: (s: { connected: boolean }) => void;
};

export type DocSyncClient = {
  sendOp: (op: WorkspaceOp) => void;
  close: () => void;
};

export function createDocSyncClient(args: {
  workspaceId: string;
  clientId: string;
  viewerId: string;
  afterSeq: number;
  events: DocSyncEvents;
}): DocSyncClient {
  const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${
    location.host
  }/ws/workspaces`;
  const ws = new WebSocket(wsUrl);
  let isOpen = false;
  const outbox: string[] = [];

  ws.addEventListener("open", () => {
    isOpen = true;
    args.events.onStatus({ connected: true });
    outbox.push(
      JSON.stringify({
        type: "hello",
        clientId: args.clientId,
        viewerId: args.viewerId,
        workspaceId: args.workspaceId,
        afterSeq: args.afterSeq,
      })
    );
    while (outbox.length) ws.send(outbox.shift()!);
  });

  ws.addEventListener("close", () => {
    isOpen = false;
    args.events.onStatus({ connected: false });
  });

  ws.addEventListener("message", (evt) => {
    try {
      const msg = zServerMsg.parse(JSON.parse(String(evt.data)));
      if (msg.type === "snapshot") {
        args.events.onSnapshot(msg.doc, msg.serverSeq);
      } else if (msg.type === "ops") {
        for (const o of msg.ops) args.events.onRemoteOp(o.op, o.serverSeq);
      } else if (msg.type === "op") {
        args.events.onRemoteOp(msg.op, msg.serverSeq);
      } else if (msg.type === "ack") {
        args.events.onAck(msg.opId, msg.serverSeq);
      }
    } catch {
      // ignore malformed
    }
  });

  return {
    sendOp(op) {
      const msg = JSON.stringify({ type: "op", op });
      if (!isOpen) {
        outbox.push(msg);
        return;
      }
      ws.send(msg);
    },
    close() {
      ws.close();
    },
  };
}
