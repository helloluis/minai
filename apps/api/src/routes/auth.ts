import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import * as db from '../services/db.js';
import { PRICING } from '../config/pricing.js';

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
        free_credit_usd: balance?.free_credit_usd ?? 0,
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
      },
    };
  });

  // Mock deposit (adds funds to balance)
  fastify.post('/api/auth/deposit', async (request) => {
    const { amount } = (request.body as { amount?: number }) || {};
    const depositAmount = amount ?? PRICING.min_deposit_usd;

    if (depositAmount < PRICING.min_deposit_usd) {
      throw { statusCode: 400, message: `Minimum deposit is $${PRICING.min_deposit_usd}` };
    }

    await db.addBalance(request.user.id, depositAmount);
    await db.recordPayment(request.user.id, depositAmount, 'deposit', `mock-${uuid()}`);

    const balance = await db.getBalance(request.user.id);
    return {
      balance: {
        balance_usd: balance?.balance_usd ?? 0,
        free_credit_usd: balance?.free_credit_usd ?? 0,
      },
    };
  });
}
