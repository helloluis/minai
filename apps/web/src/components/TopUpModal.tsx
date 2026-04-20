'use client';

import { useState, useEffect, useCallback } from 'react';
import { getDepositAddress, verifyDeposit, redeemCoupon, type DepositAddress } from '@/lib/api';
import { useChatStore } from '@/hooks/useChatStore';
import {
  detectWallet,
  connectWallet,
  ensureCeloChain,
  sendTokenTransfer,
  parseUnits,
  type WalletType,
} from '@/lib/wallet';

interface Props {
  onClose: () => void;
}

type Step = 'loading' | 'ready' | 'verifying' | 'success' | 'error';
type WalletStatus = 'idle' | 'connecting' | 'switching' | 'confirming' | 'sent' | 'verifying';
type Tab = 'wallet' | 'manual' | 'coupon';

const PRESET_AMOUNTS = ['1', '2', '5', '10'];

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

export function TopUpModal({ onClose }: Props) {
  const refreshSession = useChatStore((s) => s.refreshSession);

  const [step, setStep] = useState<Step>('loading');
  const [addressInfo, setAddressInfo] = useState<DepositAddress | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [credited, setCredited] = useState<{ amount: number; token: string; balance: number } | null>(null);

  // Wallet detection
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [tab, setTab] = useState<Tab>('manual');
  const isMiniPay = walletType === 'minipay';

  // Wallet pay state
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState('cUSD');
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('idle');

  // Manual deposit state
  const [txHash, setTxHash] = useState('');
  const [copied, setCopied] = useState(false);

  // Detect wallet + fetch deposit address
  useEffect(() => {
    const wt = detectWallet();
    setWalletType(wt);
    if (wt) setTab('wallet');

    getDepositAddress()
      .then((info) => { setAddressInfo(info); setStep('ready'); })
      .catch((e) => { setErrorMsg(e.message); setStep('error'); });
  }, []);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  // ─── Wallet Pay ──────────────────────────────────────────────────────────

  const walletLabel = walletType === 'minipay' ? 'MiniPay' : walletType === 'metamask' ? 'MetaMask' : 'Wallet';
  const walletTabLabel = walletType ? `Pay with ${walletLabel}` : 'Pay with MiniPay';

  const handleWalletPay = async () => {
    if (!addressInfo || !amount) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0.10) {
      setErrorMsg('Minimum top-up is $0.10');
      return;
    }
    setErrorMsg('');

    const token = addressInfo.tokens.find((t) => t.symbol === selectedToken);
    if (!token) { setErrorMsg(`Token ${selectedToken} not available`); return; }

    try {
      setWalletStatus('connecting');
      await connectWallet();

      setWalletStatus('switching');
      await ensureCeloChain();

      setWalletStatus('confirming');
      const units = parseUnits(amount, token.decimals);
      const hash = await sendTokenTransfer(token.contract, addressInfo.address, units);

      setWalletStatus('verifying');
      const result = await verifyDeposit(hash);
      setCredited({ amount: result.credited_usd, token: result.token, balance: result.new_balance_usd });
      await refreshSession();
      setStep('success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Transaction failed';
      // User rejection
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
        setErrorMsg('Transaction cancelled');
      } else {
        setErrorMsg(msg);
      }
      setWalletStatus('idle');
    }
  };

  // ─── Manual Verify ───────────────────────────────────────────────────────

  const handleManualVerify = async () => {
    if (!txHash.trim().startsWith('0x')) {
      setErrorMsg('Transaction hash must start with 0x');
      return;
    }
    setStep('verifying');
    setErrorMsg('');
    try {
      const result = await verifyDeposit(txHash.trim());
      setCredited({ amount: result.credited_usd, token: result.token, balance: result.new_balance_usd });
      await refreshSession();
      setStep('success');
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Verification failed');
      setStep('ready');
    }
  };

  // ─── Wallet status label ─────────────────────────────────────────────────

  const statusLabels: Record<WalletStatus, string> = {
    idle: '',
    connecting: 'Connecting wallet…',
    switching: 'Switching to Celo…',
    confirming: 'Confirm in ' + walletLabel + '…',
    sent: 'Transaction sent…',
    verifying: 'Verifying on Celo…',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">Top Up Balance</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Loading */}
          {step === 'loading' && (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
              <Spinner /> Loading…
            </div>
          )}

          {/* Ready — tabs */}
          {(step === 'ready' || step === 'verifying') && addressInfo && (
            <>
              {/* Tab switcher — hide Manual tab inside MiniPay */}
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => { setTab('wallet'); setErrorMsg(''); }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    tab === 'wallet'
                      ? 'bg-minai-600 text-white'
                      : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {walletTabLabel}
                </button>
                {!isMiniPay && (
                  <button
                    onClick={() => { setTab('manual'); setErrorMsg(''); }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      tab === 'manual'
                        ? 'bg-minai-600 text-white'
                        : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    Manual Deposit
                  </button>
                )}
                <button
                  onClick={() => { setTab('coupon'); setErrorMsg(''); }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    tab === 'coupon'
                      ? 'bg-minai-600 text-white'
                      : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  Coupon Code
                </button>
              </div>
              {tab === 'wallet' && !isMiniPay && (
                <div className="flex justify-center">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">
                    All crypto wallets supported
                  </span>
                </div>
              )}

              {/* ── Wallet tab ─────────────────────────────────────── */}
              {tab === 'wallet' && !walletType && (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No crypto wallet detected in this browser.
                  </p>
                  <a
                    href="https://minipay.to"
                    target="_blank"
                    rel="noopener"
                    className="inline-block px-4 py-2 rounded-xl bg-minai-600 hover:bg-minai-700 text-white text-sm font-medium transition-colors"
                  >
                    Get MiniPay
                  </a>
                  <p className="text-xs text-gray-400">
                    Or use MetaMask, Valora, or any Celo-compatible wallet.
                  </p>
                </div>
              )}
              {tab === 'wallet' && walletType && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {isMiniPay ? (
                      <>Pay from your <strong className="text-gray-700 dark:text-gray-200">MiniPay</strong> balance. No gas fees — instant.</>
                    ) : (
                      <>Send stablecoins directly from your wallet on <span className="text-minai-600 font-medium">Celo</span>.</>
                    )}
                  </p>

                  {/* Amount */}
                  <div>
                    <div className="text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Amount (USD)</div>
                    <div className="flex gap-2 mb-2">
                      {PRESET_AMOUNTS.map((a) => (
                        <button
                          key={a}
                          onClick={() => setAmount(a)}
                          className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            amount === a
                              ? 'border-minai-500 bg-minai-50 dark:bg-minai-900/30 text-minai-600'
                              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          ${a}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="0.10"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Custom amount"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-minai-500"
                    />
                  </div>

                  {/* Token selector */}
                  <div>
                    <div className="text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Token</div>
                    <div className="flex gap-2">
                      {addressInfo.tokens.map((t) => (
                        <button
                          key={t.symbol}
                          onClick={() => setSelectedToken(t.symbol)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                            selectedToken === t.symbol
                              ? 'border-minai-500 bg-minai-50 dark:bg-minai-900/30 text-minai-600'
                              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {t.symbol}
                        </button>
                      ))}
                    </div>
                  </div>

                  {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}

                  {/* Status */}
                  {walletStatus !== 'idle' && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Spinner /> {statusLabels[walletStatus]}
                    </div>
                  )}

                  <button
                    onClick={handleWalletPay}
                    disabled={!amount || walletStatus !== 'idle'}
                    className="w-full py-2.5 rounded-xl bg-minai-600 hover:bg-minai-700 text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {walletStatus !== 'idle' ? (
                      <><Spinner /> Processing…</>
                    ) : (
                      <>Pay {amount ? `$${amount}` : ''}</>
                    )}
                  </button>
                </div>
              )}

              {/* ── Coupon tab ─────────────────────────────────────── */}
              {tab === 'coupon' && (
                <CouponTab
                  onSuccess={(amount, balance) => {
                    setCredited({ amount, token: 'coupon', balance });
                    refreshSession();
                    setStep('success');
                  }}
                />
              )}

              {/* ── Manual tab ─────────────────────────────────────── */}
              {tab === 'manual' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Send <strong className="text-gray-700 dark:text-gray-200">cUSD, USDC, or USDT</strong> on{' '}
                    <span className="font-medium text-minai-600">{addressInfo.network}</span> to your
                    unique deposit address. Minimum: <strong>${addressInfo.minimum_deposit_usd.toFixed(2)}</strong>.
                  </p>

                  {/* Deposit address */}
                  <div>
                    <div className="text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Your deposit address</div>
                    <div
                      className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-pointer group"
                      onClick={() => handleCopy(addressInfo.address)}
                    >
                      <span className="flex-1 font-mono text-xs text-gray-700 dark:text-gray-200 break-all">
                        {addressInfo.address}
                      </span>
                      <span className="shrink-0 text-xs text-gray-400 group-hover:text-minai-600 transition-colors">
                        {copied ? '✓ copied' : 'copy'}
                      </span>
                    </div>
                  </div>

                  {/* Supported tokens */}
                  <div>
                    <div className="text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Supported tokens</div>
                    <div className="space-y-1.5">
                      {addressInfo.tokens.map((t) => (
                        <div
                          key={t.symbol}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs"
                        >
                          <span className="font-semibold text-gray-700 dark:text-gray-200">{t.symbol}</span>
                          <span
                            className="font-mono text-gray-400 cursor-pointer hover:text-minai-600 transition-colors"
                            onClick={() => handleCopy(t.contract)}
                            title="Copy contract address"
                          >
                            {t.contract.slice(0, 8)}…{t.contract.slice(-6)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* TX hash input */}
                  <div>
                    <div className="text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">After sending, paste your transaction hash</div>
                    <input
                      type="text"
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      placeholder="0x..."
                      disabled={step === 'verifying'}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-minai-500 disabled:opacity-50"
                    />
                  </div>

                  {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}

                  <button
                    onClick={handleManualVerify}
                    disabled={!txHash.trim() || step === 'verifying'}
                    className="w-full py-2.5 rounded-xl bg-minai-600 hover:bg-minai-700 text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {step === 'verifying' ? <><Spinner /> Verifying on Celo…</> : 'Verify & Credit'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Success */}
          {step === 'success' && credited && (
            <div className="text-center py-4 space-y-3">
              <div className="text-4xl">✓</div>
              <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                ${credited.amount.toFixed(2)} credited
              </div>
              <div className="text-sm text-gray-500">
                {credited.token === 'coupon' ? 'Coupon code redeemed!' : `${credited.token} deposit confirmed on Celo`}
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                New balance: ${credited.balance.toFixed(2)}
              </div>
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2 rounded-xl bg-minai-600 hover:bg-minai-700 text-white text-sm font-medium transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Error loading */}
          {step === 'error' && !addressInfo && (
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-red-500">{errorMsg}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CouponTab({ onSuccess }: { onSuccess: (amount: number, balance: number) => void }) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (trimmed.length > 12) { setError('Coupon codes are 12 characters or fewer'); return; }

    setSubmitting(true);
    setError('');
    try {
      const result = await redeemCoupon(trimmed);
      onSuccess(result.credited_usd, result.new_balance_usd);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to redeem coupon');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Enter a coupon code to add credits to your account.
      </p>

      <div>
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
          placeholder="Enter code"
          maxLength={12}
          disabled={submitting}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700
            bg-white dark:bg-gray-800 text-center text-lg font-mono tracking-widest uppercase
            placeholder-gray-300 dark:placeholder-gray-600
            focus:outline-none focus:ring-2 focus:ring-minai-500 disabled:opacity-50"
          onKeyDown={(e) => { if (e.key === 'Enter') handleRedeem(); }}
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        onClick={handleRedeem}
        disabled={!code.trim() || submitting}
        className="w-full py-2.5 rounded-xl bg-minai-600 hover:bg-minai-700 text-white text-sm
          font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {submitting ? <><Spinner /> Redeeming…</> : 'Redeem Code'}
      </button>
    </div>
  );
}
