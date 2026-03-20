import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import * as db from '../services/db.js';
import { PRICING } from '../config/pricing.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Create a new session (demo login)
  fastify.post('/api/auth/login', async (request, reply) => {
    const sessionToken = uuid();
    const user = await db.createUser(sessionToken);
    await db.createBalance(user.id, 0.50); // Guest users get $0.50 (Google SSO users get $1.00)

    reply.setCookie('session', sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 14, // 14 days
    });

    const balance = await db.getBalance(user.id);

    return {
      user: { id: user.id, created_at: user.created_at },
      balance: {
        balance_usd: balance?.balance_usd ?? 0,
        free_credit_usd: balance?.free_credit_usd ?? 0,
        balance_high_water: balance?.balance_high_water ?? 1,
      },
    };
  });

  // Get current session
  fastify.get('/api/auth/me', async (request) => {
    const balance = await db.getBalance(request.user.id);
    return {
      user: {
        id: request.user.id,
        created_at: request.user.created_at,
        email: request.user.email ?? null,
        display_name: request.user.display_name ?? null,
        avatar_url: request.user.avatar_url ?? null,
        google_id: request.user.google_id ?? null,
      },
      balance: {
        balance_usd: balance?.balance_usd ?? 0,
        free_credit_usd: balance?.free_credit_usd ?? 0,
        balance_high_water: balance?.balance_high_water ?? 1,
      },
    };
  });

  // Mock deposit removed — use /api/payment/verify with real on-chain tx
}
