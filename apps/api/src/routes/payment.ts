import type { FastifyInstance } from 'fastify';
import { getOrCreateDepositAddress, verifyDeposit, SUPPORTED_TOKENS } from '../services/wallet.js';
import { addBalance, recordPayment, getBalance, getUserById, pool } from '../services/db.js';

export default async function paymentRoutes(fastify: FastifyInstance) {
  // GET /api/payment/address — returns (or creates) the user's deposit address
  fastify.get('/api/payment/address', async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    const address = await getOrCreateDepositAddress(userId);
    return {
      address,
      network: 'Celo',
      tokens: Object.entries(SUPPORTED_TOKENS).map(([symbol, { address: contract, decimals }]) => ({
        symbol,
        contract,
        decimals,
        normalized_decimals: 6,
      })),
      minimum_deposit_usd: 0.10,
    };
  });

  // POST /api/payment/verify — verify a tx hash and credit the balance
  fastify.post<{ Body: { tx_hash: string } }>(
    '/api/payment/verify',
    {
      schema: { body: { type: 'object', required: ['tx_hash'], properties: { tx_hash: { type: 'string' } } } },
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const userId = request.user?.id;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const { tx_hash } = request.body;
      if (!/^0x[a-fA-F0-9]{64}$/.test(tx_hash)) {
        return reply.code(400).send({ error: 'Invalid transaction hash format' });
      }

      const deposit = await verifyDeposit(userId, tx_hash);
      await addBalance(userId, deposit.amount_usd);
      await recordPayment(userId, deposit.amount_usd, 'deposit', deposit.tx_hash, 'celo', deposit.token);

      const balance = await getBalance(userId);
      const newBalanceUsd = balance?.balance_usd ?? 0;

      // Send receipt email if user has an email address (fire-and-forget)
      getUserById(userId).then((user) => {
        if (user?.email) {
          import('../services/email.js').then(({ sendTopUpReceiptEmail }) => {
            sendTopUpReceiptEmail({
              userEmail: user.email!,
              userName: user.display_name,
              amountUsd: deposit.amount_usd,
              token: deposit.token,
              txHash: deposit.tx_hash,
              newBalanceUsd,
            }).catch(() => {});
          });
        }
      });

      return {
        success: true,
        credited_usd: deposit.amount_usd,
        token: deposit.token,
        new_balance_usd: newBalanceUsd,
      };
    }
  );

  // POST /api/payment/coupon — redeem a coupon code
  fastify.post<{ Body: { code: string } }>(
    '/api/payment/coupon',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const userId = request.user?.id;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const { code } = request.body;
      if (!code || typeof code !== 'string' || code.length > 12) {
        return reply.code(400).send({ error: 'Invalid coupon code' });
      }

      // Look up coupon (case-insensitive)
      const { rows: couponRows } = await pool.query(
        'SELECT * FROM coupon_codes WHERE LOWER(name) = LOWER($1)',
        [code.trim()]
      );
      if (couponRows.length === 0) {
        return reply.code(404).send({ error: 'Coupon code not found' });
      }

      const coupon = couponRows[0] as {
        id: string; name: string; amount_cents: number;
        one_time_use: boolean; expires_at: string | null; usage_count: number;
      };

      // Check expiry
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return reply.code(400).send({ error: 'This coupon has expired' });
      }

      // Check if user already redeemed this coupon
      const { rows: existing } = await pool.query(
        'SELECT 1 FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2',
        [coupon.id, userId]
      );
      if (existing.length > 0) {
        return reply.code(400).send({ error: 'You have already used this coupon' });
      }

      // Check one-time-use (already used by anyone)
      if (coupon.one_time_use && coupon.usage_count > 0) {
        return reply.code(400).send({ error: 'This coupon has already been redeemed' });
      }

      // Redeem
      const amountUsd = coupon.amount_cents / 100;

      await pool.query('BEGIN');
      try {
        // Credit balance
        await addBalance(userId, amountUsd);

        // Record redemption
        await pool.query(
          'INSERT INTO coupon_redemptions (coupon_id, user_id, amount_usd) VALUES ($1, $2, $3)',
          [coupon.id, userId, amountUsd]
        );

        // Increment usage count
        await pool.query(
          'UPDATE coupon_codes SET usage_count = usage_count + 1 WHERE id = $1',
          [coupon.id]
        );

        // Record payment
        await pool.query(
          `INSERT INTO payments (user_id, amount_usd, status, payment_method, coupon_code_id, coupon_code_amount)
           VALUES ($1, $2, 'completed', 'coupon', $3, $4)`,
          [userId, amountUsd, coupon.id, amountUsd]
        );

        await pool.query('COMMIT');
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }

      const balance = await getBalance(userId);
      console.log(`[Coupon] ${code} redeemed by ${userId.slice(0, 8)} for $${amountUsd.toFixed(2)}`);

      return {
        success: true,
        code: coupon.name,
        credited_usd: amountUsd,
        new_balance_usd: balance?.balance_usd ?? 0,
      };
    }
  );
}
