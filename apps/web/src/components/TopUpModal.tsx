'use client';

import { useState, useEffect, useCallback } from 'react';
import { getDepositAddress, verifyDeposit, type DepositAddress } from '@/lib/api';
import { useChatStore } from '@/hooks/useChatStore';

interface Props {
  onClose: () => void;
}

type Step = 'loading' | 'address' | 'verifying' | 'success' | 'error';

export function TopUpModal({ onClose }: Props) {
  const refreshSession = useChatStore((s) => s.refreshSession);

  const [step, setStep] = useState<Step>('loading');
  const [addressInfo, setAddressInfo] = useState<DepositAddress | null>(null);
  const [txHash, setTxHash] = useState('');
  const [credited, setCredited] = useState<{ amount: number; token: string; balance: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDepositAddress()
      .then((info) => { setAddressInfo(info); setStep('address'); })
      .catch((e) => { setErrorMsg(e.message); setStep('error'); });
  }, []);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleVerify = async () => {
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
      setStep('address');
    }
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

        <div className="px-6 py-5 space-y-5">
          {/* Loading */}
          {step === 'loading' && (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Generating your deposit address…
            </div>
          )}

          {/* Address + verify flow */}
          {(step === 'address' || step === 'verifying') && addressInfo && (
            <>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Send <strong className="text-gray-700 dark:text-gray-200">USDC or USDT</strong> on{' '}
                <span className="font-medium text-minai-600">{addressInfo.network}</span> to your
                unique deposit address below. Minimum: <strong>${addressInfo.minimum_deposit_usd.toFixed(2)}</strong>.
              </div>

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
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono text-gray-700 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-minai-500 disabled:opacity-50"
                />
              </div>

              {errorMsg && (
                <p className="text-xs text-red-500">{errorMsg}</p>
              )}

              <button
                onClick={handleVerify}
                disabled={!txHash.trim() || step === 'verifying'}
                className="w-full py-2.5 rounded-xl bg-minai-600 hover:bg-minai-700 text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {step === 'verifying' ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Verifying on Celo…
                  </>
                ) : (
                  'Verify & Credit'
                )}
              </button>
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
                {credited.token} deposit confirmed on Celo
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

          {/* Error loading address */}
          {step === 'error' && (
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
