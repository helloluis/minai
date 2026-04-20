/**
 * Browser wallet utilities — MiniPay, MetaMask, and generic EVM wallets.
 * Zero dependencies: uses raw window.ethereum calls only.
 */

export type WalletType = 'minipay' | 'metamask' | 'evm';

const CELO_CHAIN_ID_HEX = '0xa4ec'; // 42220

const CELO_CHAIN_PARAMS = {
  chainId: CELO_CHAIN_ID_HEX,
  chainName: 'Celo',
  nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
  rpcUrls: ['https://forno.celo.org'],
  blockExplorerUrls: ['https://celoscan.io'],
};

// ERC-20 transfer(address,uint256) selector
const TRANSFER_SELECTOR = '0xa9059cbb';

interface EthereumProvider {
  isMiniPay?: boolean;
  isMetaMask?: boolean;
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

/** Detect which wallet is available, if any */
export function detectWallet(): WalletType | null {
  if (typeof window === 'undefined' || !window.ethereum) return null;
  if (window.ethereum.isMiniPay) return 'minipay';
  if (window.ethereum.isMetaMask) return 'metamask';
  return 'evm';
}

/** Request wallet connection, returns the connected address.
 * Inside MiniPay, connection is implicit — try eth_accounts first to avoid
 * a redundant permission flash. Fall back to eth_requestAccounts if needed.
 */
export async function connectWallet(): Promise<string> {
  if (!window.ethereum) throw new Error('No wallet detected');

  if (window.ethereum.isMiniPay) {
    const existing = (await window.ethereum.request({
      method: 'eth_accounts',
    })) as string[];
    if (existing.length) return existing[0];
  }

  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[];
  if (!accounts.length) throw new Error('No accounts returned');
  return accounts[0];
}

/** Ensure the wallet is on Celo mainnet. MiniPay is always on Celo. */
export async function ensureCeloChain(): Promise<void> {
  if (!window.ethereum) return;
  // MiniPay is always Celo — skip switching
  if (window.ethereum.isMiniPay) return;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CELO_CHAIN_ID_HEX }],
    });
  } catch (err: unknown) {
    // 4902 = chain not added
    if ((err as { code?: number }).code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [CELO_CHAIN_PARAMS],
      });
    } else {
      throw err;
    }
  }
}

/** Convert a decimal amount string to token smallest units as bigint */
export function parseUnits(amount: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(paddedFrac);
}

/** Pad a hex string (without 0x) to 64 chars (32 bytes) */
function pad32(hex: string): string {
  return hex.padStart(64, '0');
}

/**
 * Send an ERC-20 transfer via the connected wallet.
 * Returns the transaction hash.
 */
export async function sendTokenTransfer(
  tokenAddress: string,
  toAddress: string,
  amountUnits: bigint,
): Promise<string> {
  if (!window.ethereum) throw new Error('No wallet detected');

  const accounts = (await window.ethereum.request({
    method: 'eth_accounts',
  })) as string[];
  if (!accounts.length) throw new Error('Wallet not connected');

  // Encode transfer(address,uint256) calldata
  const to32 = pad32(toAddress.replace('0x', '').toLowerCase());
  const amt32 = pad32(amountUnits.toString(16));
  const data = TRANSFER_SELECTOR + to32 + amt32;

  const txHash = (await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: accounts[0],
        to: tokenAddress,
        data,
        value: '0x0',
      },
    ],
  })) as string;

  return txHash;
}
