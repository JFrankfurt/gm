import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isMarketEntitled } from './entitlements';
import { subscribeExecutions } from './executionBus';

export function registerExecutionsSse(app: FastifyInstance) {
  app.get('/api/executions/stream', async (req, reply) => {
    const q = z
      .object({
        symbol: z.string().min(1).default('BTC-USD'),
        as: z.string().min(1).optional(),
      })
      .parse(req.query);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    const viewerId = q.as ?? 'anon';
    if (!isMarketEntitled({ viewerId, symbol: q.symbol })) {
      reply.raw.write(`event: gm_error\n`);
      reply.raw.write(
        `data: ${JSON.stringify({
          type: 'error',
          code: 'forbidden',
          viewerId,
          symbol: q.symbol,
        })}\n\n`,
      );
      reply.raw.end();
      return;
    }

    const unsubscribe = subscribeExecutions({
      viewerId,
      symbol: q.symbol,
      onEvent: (evt) => {
        reply.raw.write(`event: execution\n`);
        reply.raw.write(`data: ${JSON.stringify(evt)}\n\n`);
      },
    });

    req.raw.on('close', () => {
      unsubscribe();
    });
  });
}


