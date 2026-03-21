import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { verifyMessage } from 'viem';
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

  // Wallet-based login (MiniPay / MetaMask)
  fastify.post('/api/auth/wallet', async (request, reply) => {
    const { address, signature, message } = request.body as {
      address: string;
      signature: string;
      message: string;
    };

    if (!address || !signature || !message) {
      return reply.status(400).send({ error: 'Missing address, signature, or message' });
    }

    // Verify the signature matches the claimed address
    try {
      const valid = await verifyMessage({
        address: address as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
      if (!valid) {
        return reply.status(401).send({ error: 'Invalid signature' });
      }
    } catch {
      return reply.status(401).send({ error: 'Signature verification failed' });
    }

    // Check if message is recent (within 5 minutes)
    const tsMatch = message.match(/Timestamp: (\d+)/);
    if (tsMatch) {
      const msgTime = parseInt(tsMatch[1], 10);
      const now = Date.now();
      if (Math.abs(now - msgTime) > 5 * 60 * 1000) {
        return reply.status(401).send({ error: 'Message expired' });
      }
    }

    // Find or create user by wallet address
    let user = await db.getUserByWallet(address);
    let isNew = false;

    if (!user) {
      const sessionToken = uuid();
      user = await db.createWalletUser(sessionToken, address);
      await db.createBalance(user.id, 1.00); // Wallet users get $1.00
      isNew = true;
      console.log(`[Auth] New wallet user: ${address.slice(0, 10)}... → ${user.id.slice(0, 8)}`);
    } else {
      // Rotate session token on re-login
      const sessionToken = uuid();
      await db.pool.query('UPDATE users SET session_token = $1 WHERE id = $2', [sessionToken, user.id]);
      user.session_token = sessionToken;
    }

    reply.setCookie('session', user.session_token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 14, // 14 days
    });

    const balance = await db.getBalance(user.id);

    return {
      user: {
        id: user.id,
        created_at: user.created_at,
        wallet_address: user.wallet_address,
        email: user.email ?? null,
        display_name: user.display_name ?? null,
        avatar_url: user.avatar_url ?? null,
        google_id: user.google_id ?? null,
      },
      balance: {
        balance_usd: balance?.balance_usd ?? 0,
        free_credit_usd: balance?.free_credit_usd ?? 0,
        balance_high_water: balance?.balance_high_water ?? 1,
      },
      is_new: isNew,
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
        wallet_address: request.user.wallet_address ?? null,
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
