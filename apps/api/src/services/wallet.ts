import { createPublicClient, http, parseAbi, decodeEventLog, getAddress } from 'viem';
import { celoSepolia } from 'viem/chains';
import { mnemonicToAccount } from 'viem/accounts';
import { pool } from './db.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const SEED_PHRASE = process.env.WALLET_SEED!;

export const SUPPORTED_TOKENS: Record<string, { address: `0x${string}`; decimals: number }> = {
  USDC: { address: '0x01C5C0122039549AD1493B8220cABEdD739BC44E', decimals: 6 },
  USDT: { address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', decimals: 18 }, // testnet USDT uses 18dp
};

// Normalize all token amounts to 6 decimal places (1_000_000 units = $1.00)
export const DECIMALS_NORMALIZED = 6;

const client = createPublicClient({
  chain: celoSepolia,
  transport: http(process.env.CELO_RPC_URL ?? 'https://forno.celo-sepolia.celo-testnet.org'),
});

const ERC20_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

// ─── HD wallet derivation ─────────────────────────────────────────────────────

async function getNextIndex(): Promise<number> {
  const { rows } = await pool.query<{ max: number | null }>(
    'SELECT MAX(deposit_address_index) AS max FROM user_balances'
  );
  return (rows[0]?.max ?? -1) + 1;
}

export async function getOrCreateDepositAddress(userId: string): Promise<string> {
  const { rows } = await pool.query<{ deposit_address: string | null }>(
    'SELECT deposit_address FROM user_balances WHERE user_id = $1',
    [userId]
  );

  if (rows[0]?.deposit_address) return rows[0].deposit_address;

  const index = await getNextIndex();
  const account = mnemonicToAccount(SEED_PHRASE, { addressIndex: index });
  const address = account.address;

  await pool.query(
    'UPDATE user_balances SET deposit_address = $1, deposit_address_index = $2 WHERE user_id = $3',
    [address, index, userId]
  );

  return address;
}

// ─── Transaction verification ─────────────────────────────────────────────────

export interface VerifiedDeposit {
  amount_usd: number;
  token: string;
  tx_hash: string;
}

export async function verifyDeposit(userId: string, txHash: string): Promise<VerifiedDeposit> {
  // Normalise hash format
  const hash = txHash.trim() as `0x${string}`;

  // Guard: already processed
  const { rows: existing } = await pool.query(
    'SELECT id FROM payments WHERE tx_hash = $1',
    [hash]
  );
  if (existing.length > 0) throw new Error('Transaction already credited');

  // Get user deposit address
  const { rows } = await pool.query<{ deposit_address: string | null }>(
    'SELECT deposit_address FROM user_balances WHERE user_id = $1',
    [userId]
  );
  const depositAddress = rows[0]?.deposit_address;
  if (!depositAddress) throw new Error('No deposit address found — please reload and try again');

  // Fetch receipt
  const receipt = await client.getTransactionReceipt({ hash });
  if (!receipt) throw new Error('Transaction not found on Celo Alfajores');
  if (receipt.status !== 'success') throw new Error('Transaction did not succeed');

  // Scan Transfer logs for a matching token → deposit address
  for (const log of receipt.logs) {
    const tokenEntry = Object.entries(SUPPORTED_TOKENS).find(
      ([, t]) => t.address.toLowerCase() === log.address.toLowerCase()
    );
    if (!tokenEntry) continue;

    const [symbol, { decimals }] = tokenEntry;

    let decoded: { eventName: string; args: Record<string, unknown> };
    try {
      decoded = decodeEventLog({ abi: ERC20_ABI, data: log.data, topics: log.topics }) as typeof decoded;
    } catch {
      continue;
    }
    if (decoded.eventName !== 'Transfer') continue;

    const { to, value } = decoded.args as { from: string; to: string; value: bigint };
    if (getAddress(to) !== getAddress(depositAddress)) continue;

    // Normalize to 6 decimal places
    const scale = BigInt(10 ** Math.max(0, decimals - DECIMALS_NORMALIZED));
    const normalized = value / scale;
    const amountUsd = Number(normalized) / 10 ** DECIMALS_NORMALIZED;

    if (amountUsd < 0.10) throw new Error(`Minimum deposit is $0.10 (received $${amountUsd.toFixed(6)})`);

    return { amount_usd: amountUsd, token: symbol, tx_hash: hash };
  }

  throw new Error('No valid transfer to your deposit address found in this transaction');
}
