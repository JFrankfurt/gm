import type { FastifyInstance } from "fastify";
import { z } from "zod";
import WebSocket from "ws";

// Hyperliquid API endpoints
const HYPERLIQUID_WS_URL = "wss://api.hyperliquid.xyz/ws";
const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/info";

// Map common symbols to Hyperliquid coin names
// Extract base symbol (e.g., "BTC-USD" -> "BTC")
function getCoinName(symbol: string): string {
  const upper = symbol.toUpperCase().replace(/[-_]/g, "");
  return upper.split("-")[0] || upper;
}

type HyperliquidTick = {
  type: "tick";
  symbol: string;
  ts: number;
  bid: number;
  ask: number;
};

// Fetch initial market data from Hyperliquid REST API
async function fetchInitialPrice(coin: string): Promise<{ bid: number; ask: number } | null> {
  try {
    const res = await fetch(`${HYPERLIQUID_API_URL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "meta",
      }),
    });

    if (!res.ok) return null;

    const meta: any = await res.json();
    const coinInfo = meta?.universe?.find((u: { name: string }) => u.name === coin);
    if (!coinInfo) return null;

    // Fetch order book for the coin
    const bookRes = await fetch(`${HYPERLIQUID_API_URL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "l2Book",
        coin,
      }),
    });

    if (!bookRes.ok) return null;

    const book: any = await bookRes.json();
    const levels = book?.levels;
    if (!levels || levels.length < 2) return null;

    const bids = levels[0] || [];
    const asks = levels[1] || [];

    if (bids.length === 0 || asks.length === 0) return null;

    const bid = parseFloat(bids[0][0]);
    const ask = parseFloat(asks[0][0]);

    return { bid, ask };
  } catch {
    return null;
  }
}

export function registerHyperliquidSse(app: FastifyInstance) {
  app.get("/api/hyperliquid/stream", async (req, reply) => {
    const q = z
      .object({
        symbol: z.string().min(1).default("BTC"),
        as: z.string().min(1).optional(),
      })
      .parse(req.query);

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders?.();

    const viewerId = q.as ?? "anon";
    const coin = getCoinName(q.symbol);

    // Fetch initial price
    const initial = await fetchInitialPrice(coin);
    if (initial) {
      const tick: HyperliquidTick = {
        type: "tick",
        symbol: q.symbol,
        ts: Date.now(),
        bid: initial.bid,
        ask: initial.ask,
      };
      reply.raw.write(`event: tick\n`);
      reply.raw.write(`data: ${JSON.stringify(tick)}\n\n`);
    }

    // Connect to Hyperliquid WebSocket for real-time updates
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(HYPERLIQUID_WS_URL);

        ws.on("open", () => {
          console.log(`[Hyperliquid] WebSocket connected for ${coin}`);
          
          // Subscribe to both l2Book and trades for comprehensive price data
          // l2Book gives bid/ask spread, trades give actual execution prices
          const subscribeL2 = {
            method: "subscribe",
            subscription: {
              type: "l2Book",
              coin,
            },
          };
          const subscribeTrades = {
            method: "subscribe",
            subscription: {
              type: "trades",
              coin,
            },
          };
          
          ws?.send(JSON.stringify(subscribeL2));
          ws?.send(JSON.stringify(subscribeTrades));
          console.log(`[Hyperliquid] Subscribed to l2Book and trades for ${coin}`);
        });

        ws.on("message", (data: WebSocket.Data) => {
          try {
            const msg = JSON.parse(data.toString());

            // Handle l2Book updates
            // Expected format: {"channel": "l2Book", "data": {"coin": "BTC", "levels": [[bids...], [asks...]]}}
            if (msg.channel === "l2Book" && msg.data?.coin === coin) {
              const levels = msg.data.levels;
              if (levels && Array.isArray(levels) && levels.length >= 2) {
                const bids = levels[0] || [];
                const asks = levels[1] || [];

                if (bids.length > 0 && asks.length > 0) {
                  const bid = parseFloat(bids[0].px || bids[0][0]);
                  const ask = parseFloat(asks[0].px || asks[0][0]);

                  const tick: HyperliquidTick = {
                    type: "tick",
                    symbol: q.symbol,
                    ts: Date.now(),
                    bid,
                    ask,
                  };

                  if (reply.raw.writable) {
                    reply.raw.write(`event: tick\n`);
                    reply.raw.write(`data: ${JSON.stringify(tick)}\n\n`);
                  }
                }
              }
            }
            
            // Also handle trades as backup/supplement
            // Expected format: {"channel": "trades", "data": [{"coin": "BTC", "px": "50000", "side": "A", ...}]}
            if (msg.channel === "trades" && Array.isArray(msg.data)) {
              for (const trade of msg.data) {
                if (trade.coin === coin && trade.px) {
                  const price = parseFloat(trade.px);
                  // Use trade price as both bid and ask (will be refined by l2Book)
                  const tick: HyperliquidTick = {
                    type: "tick",
                    symbol: q.symbol,
                    ts: Date.now(),
                    bid: price,
                    ask: price,
                  };

                  if (reply.raw.writable) {
                    reply.raw.write(`event: tick\n`);
                    reply.raw.write(`data: ${JSON.stringify(tick)}\n\n`);
                  }
                }
              }
            }
          } catch (err) {
            // Log parse errors for debugging
            if (reply.raw.writable) {
              reply.raw.write(`event: gm_error\n`);
              reply.raw.write(
                `data: ${JSON.stringify({
                  type: "error",
                  code: "parse_error",
                  symbol: q.symbol,
                  viewerId,
                  message: err instanceof Error ? err.message : "unknown",
                })}\n\n`
              );
            }
          }
        });

        ws.on("error", (err) => {
          if (reply.raw.writable) {
            reply.raw.write(`event: gm_error\n`);
            reply.raw.write(
              `data: ${JSON.stringify({
                type: "error",
                code: "websocket_error",
                symbol: q.symbol,
                viewerId,
                message: err.message,
              })}\n\n`
            );
          }
        });

        ws.on("close", () => {
          // Attempt reconnect after 2 seconds
          if (reply.raw.writable) {
            reconnectTimeout = setTimeout(() => {
              if (reply.raw.writable) {
                connect();
              }
            }, 2000);
          }
        });
      } catch (err) {
        if (reply.raw.writable) {
          reply.raw.write(`event: gm_error\n`);
          reply.raw.write(
            `data: ${JSON.stringify({
              type: "error",
              code: "connection_failed",
              symbol: q.symbol,
              viewerId,
              message: err instanceof Error ? err.message : "unknown error",
            })}\n\n`
          );
        }
      }
    };

    connect();

    req.raw.on("close", () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.removeAllListeners();
        ws.close();
      }
    });
  });
}

