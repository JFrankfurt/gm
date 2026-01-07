import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import WebSocket from "ws";

function waitForMessages(
  ws: WebSocket,
  count: number,
  timeoutMs = 1500
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const out: unknown[] = [];
    const t = setTimeout(
      () => cleanup(() => reject(new Error("timeout waiting for message"))),
      timeoutMs
    );

    function cleanup(fn?: () => void) {
      clearTimeout(t);
      ws.off("message", onMessage);
      ws.off("close", onClose);
      fn?.();
    }

    function onClose() {
      cleanup(() => reject(new Error("ws closed before message")));
    }

    function onMessage(raw: WebSocket.RawData) {
      out.push(JSON.parse(raw.toString()));
      if (out.length >= count) cleanup(() => resolve(out));
    }

    ws.on("message", onMessage);
    ws.on("close", onClose);
  });
}

describe("doc sync websocket", () => {
  it("hello returns snapshot and op broadcasts with ack", async () => {
    const dbPath = path.join(
      os.tmpdir(),
      `gm-ws-test-${crypto.randomUUID()}.sqlite3`
    );
    const app = buildApp({ dbPath });
    await app.ready();

    // create workspace
    const createRes = await app.inject({
      method: "POST",
      url: "/api/workspaces?as=userA",
    });
    expect(createRes.statusCode).toBe(201);
    const { workspaceId } = createRes.json() as { workspaceId: string };

    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const url = new URL(address);
    const ws = new WebSocket(`ws://${url.host}/ws/workspaces`, {
      handshakeTimeout: 3000,
    });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("timeout waiting for ws open")),
        3000
      );
      ws.once("open", () => {
        clearTimeout(t);
        resolve();
      });
      ws.once("unexpected-response", (_req, res) => {
        clearTimeout(t);
        reject(new Error(`unexpected ws response: ${res.statusCode}`));
      });
      ws.once("close", () => {
        clearTimeout(t);
        reject(new Error("ws closed before open"));
      });
      ws.once("error", (err: unknown) => {
        clearTimeout(t);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });

     ws.send(
       JSON.stringify({
         type: "hello",
         clientId: "c1",
         viewerId: "userA",
         workspaceId,
         afterSeq: 0,
       })
     );
    const [snap] = await waitForMessages(ws, 1);
    expect((snap as any).type).toBe("snapshot");
    expect((snap as any).doc.workspaceId).toBe(workspaceId);

    const op = {
      opId: "op1",
      clientId: "c1",
      now: new Date(0).toISOString(),
      type: "setViewport",
      viewport: { centerX: 10, centerY: 20, zoom: 1.2 },
    };

    ws.send(JSON.stringify({ type: "op", op }));
    const msgs = await waitForMessages(ws, 2);

    const ack = msgs.find((m: any) => m.type === "ack");
    const broadcast = msgs.find((m: any) => m.type === "op");

    expect(ack).toBeTruthy();
    expect((ack as any).opId).toBe("op1");
    expect(typeof (ack as any).serverSeq).toBe("number");

    expect(broadcast).toBeTruthy();
    expect((broadcast as any).op.opId).toBe("op1");

    ws.close();
    await app.close();
  });
});
