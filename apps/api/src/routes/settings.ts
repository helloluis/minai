import type { FastifyInstance } from 'fastify';
import * as db from '../services/db.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  // PUT /api/settings/timezone — set user timezone (auto-detected by frontend)
  fastify.put<{ Body: { timezone: string } }>(
    '/api/settings/timezone',
    async (request, reply) => {
      const { timezone } = request.body ?? {};
      if (!timezone || typeof timezone !== 'string') {
        return reply.code(400).send({ error: 'timezone required' });
      }
      await db.setUserTimezone(request.user.id, timezone);
      return { success: true, timezone };
    }
  );

  // GET /api/settings/memory — get user's memory text
  fastify.get('/api/settings/memory', async (request) => {
    const user = await db.getUserById(request.user.id);
    return { memory_text: user?.memory_text ?? '' };
  });

  // PUT /api/settings/memory — update user's memory text
  fastify.put<{ Body: { memory_text: string } }>(
    '/api/settings/memory',
    async (request, reply) => {
      const { memory_text } = request.body ?? {};
      if (typeof memory_text !== 'string') {
        return reply.code(400).send({ error: 'memory_text required' });
      }
      const trimmed = memory_text.slice(0, 2000); // max 2000 chars
      await db.pool.query('UPDATE users SET memory_text = $1 WHERE id = $2', [trimmed, request.user.id]);
      return { success: true, memory_text: trimmed, chars: trimmed.length, max: 2000 };
    }
  );

  // GET /api/settings/payments — top-up history
  fastify.get('/api/settings/payments', async (request) => {
    return db.getPaymentHistory(request.user.id);
  });

  // GET /api/settings/usage?days=30
  fastify.get('/api/settings/usage', async (request) => {
    const { days } = (request.query as { days?: string });
    const n = Math.min(parseInt(days ?? '30') || 30, 365);
    const [daily, totals] = await Promise.all([
      db.getTokenUsageByDay(request.user.id, n),
      db.getTotalUsage(request.user.id),
    ]);
    return { daily, totals };
  });
}
