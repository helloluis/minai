import type { FastifyInstance } from 'fastify';
import { getOrCreateDepositAddress, verifyDeposit, SUPPORTED_TOKENS } from '../services/wallet.js';
import { addBalance, recordPayment, getBalance } from '../services/db.js';

export default async function paymentRoutes(fastify: FastifyInstance) {
  // GET /api/payment/address — returns (or creates) the user's deposit address
  fastify.get('/api/payment/address', async (request, reply) => {
    const userId = (request as any).userId as string | undefined;
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    const address = await getOrCreateDepositAddress(userId);
    return {
      address,
      network: 'Celo Alfajores (testnet)',
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
    { schema: { body: { type: 'object', required: ['tx_hash'], properties: { tx_hash: { type: 'string' } } } } },
    async (request, reply) => {
      const userId = (request as any).userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const { tx_hash } = request.body;
      if (!tx_hash?.startsWith('0x')) {
        return reply.code(400).send({ error: 'Invalid transaction hash — must start with 0x' });
      }

      const deposit = await verifyDeposit(userId, tx_hash);
      await addBalance(userId, deposit.amount_usd);
      await recordPayment(userId, deposit.amount_usd, 'deposit', deposit.tx_hash, 'celo', deposit.token);

      const balance = await getBalance(userId);
      return {
        success: true,
        credited_usd: deposit.amount_usd,
        token: deposit.token,
        new_balance_usd: balance?.balance_usd ?? 0,
      };
    }
  );
}
