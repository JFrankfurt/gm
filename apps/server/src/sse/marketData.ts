import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isMarketEntitled } from "./entitlements";

export function registerMarketDataSse(app: FastifyInstance) {
  app.get("/api/market/stream", async (req, reply) => {
    const q = z
      .object({
        symbol: z.string().min(1).default("BTC-USD"),
        as: z.string().min(1).optional(),
      })
      .parse(req.query);

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");

    // CORS is handled globally; ensure headers are flushed.
    reply.raw.flushHeaders?.();

    const viewerId = q.as ?? "anon";

    if (!isMarketEntitled({ viewerId, symbol: q.symbol })) {
      reply.raw.write(`event: gm_error\n`);
      reply.raw.write(
        `data: ${JSON.stringify({
          type: "error",
          code: "forbidden",
          viewerId,
          symbol: q.symbol,
        })}\n\n`
      );
      reply.raw.end();
      return;
    }

    let mid = q.symbol.length * 1000 + 100_000;

    const interval = setInterval(() => {
      const delta = (Math.random() - 0.5) * 25;
      mid += delta;
      const spread = Math.max(0.5, Math.abs(delta) * 0.2 + 1.5);
      const bid = mid - spread / 2;
      const ask = mid + spread / 2;

      const data = {
        type: "tick",
        symbol: q.symbol,
        viewerId,
        ts: Date.now(),
        bid,
        ask,
      };

      reply.raw.write(`event: tick\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    }, 250);

    req.raw.on("close", () => {
      clearInterval(interval);
    });
  });
}
