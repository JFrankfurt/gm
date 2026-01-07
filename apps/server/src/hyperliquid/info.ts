import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getBuilderConfig } from './config';

const HYPERLIQUID_API_URL = process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz';

export function registerHyperliquidInfo(app: FastifyInstance) {
  // Get asset metadata
  app.get('/api/hyperliquid/meta', async (req, reply) => {
    try {
      const res = await fetch(`${HYPERLIQUID_API_URL}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' }),
      });

      if (!res.ok) {
        reply.code(502);
        return { error: 'upstream_error', status: res.status };
      }

      return res.json();
    } catch (err) {
      reply.code(500);
      return { error: 'fetch_failed', message: err instanceof Error ? err.message : 'unknown' };
    }
  });

  // Get account info (including nonce)
  app.get('/api/hyperliquid/account/:address', async (req, reply) => {
    const params = z.object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(req.params);

    try {
      const res = await fetch(`${HYPERLIQUID_API_URL}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: params.address,
        }),
      });

      if (!res.ok) {
        reply.code(502);
        return { error: 'upstream_error', status: res.status };
      }

      return res.json();
    } catch (err) {
      reply.code(500);
      return { error: 'fetch_failed', message: err instanceof Error ? err.message : 'unknown' };
    }
  });

  // Get builder configuration
  app.get('/api/hyperliquid/builder', async () => {
    return getBuilderConfig();
  });

  // Get user fills
  app.get('/api/hyperliquid/fills/:address', async (req, reply) => {
    const params = z.object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(req.params);

    try {
      const res = await fetch(`${HYPERLIQUID_API_URL}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'userFills',
          user: params.address,
        }),
      });

      if (!res.ok) {
        reply.code(502);
        return { error: 'upstream_error', status: res.status };
      }

      return res.json();
    } catch (err) {
      reply.code(500);
      return { error: 'fetch_failed', message: err instanceof Error ? err.message : 'unknown' };
    }
  });

  // Get open orders
  app.get('/api/hyperliquid/orders/:address', async (req, reply) => {
    const params = z.object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(req.params);

    try {
      const res = await fetch(`${HYPERLIQUID_API_URL}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'openOrders',
          user: params.address,
        }),
      });

      if (!res.ok) {
        reply.code(502);
        return { error: 'upstream_error', status: res.status };
      }

      return res.json();
    } catch (err) {
      reply.code(500);
      return { error: 'fetch_failed', message: err instanceof Error ? err.message : 'unknown' };
    }
  });
}

