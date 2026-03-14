import type { FastifyInstance } from 'fastify';
import * as db from '../services/db.js';

export async function settingsRoutes(fastify: FastifyInstance) {
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
