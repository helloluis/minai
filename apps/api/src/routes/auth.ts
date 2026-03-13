import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import * as db from '../services/db.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Create a new session (demo login)
  fastify.post('/api/auth/login', async (request, reply) => {
    const sessionToken = uuid();
    const user = await db.createUser(sessionToken);
    await db.createBalance(user.id);

    reply.setCookie('session', sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    const balance = await db.getBalance(user.id);

    return {
      user: { id: user.id, created_at: user.created_at },
      balance: {
        balance_usd: balance?.balance_usd ?? 0,
        free_tokens_remaining: balance?.free_tokens_remaining ?? 1000,
      },
    };
  });

  // Get current session
  fastify.get('/api/auth/me', async (request) => {
    const balance = await db.getBalance(request.user.id);
    return {
      user: { id: request.user.id, created_at: request.user.created_at },
      balance: {
        balance_usd: balance?.balance_usd ?? 0,
        free_tokens_remaining: balance?.free_tokens_remaining ?? 1000,
      },
    };
  });
}
