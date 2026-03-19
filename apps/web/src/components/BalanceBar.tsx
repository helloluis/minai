'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '@/hooks/useChatStore';
import { FREE_CREDIT_INITIAL_USD } from '@minai/shared';
import { TopUpModal } from './TopUpModal';
import { MinaiLogo } from './MinaiLogo';

function getRemainingColor(remainingPct: number): string {
  if (remainingPct <= 10) return '#ef4444'; // red
  if (remainingPct <= 25) return '#f97316'; // orange
  if (remainingPct <= 35) return '#eab308'; // yellow
  return '#22c55e'; // green
}

/** Smart money format: "$5.00", "$1.00", "$0.75", "$0.09", "$0.00" */
function formatBalance(usd: number): string {
  if (usd >= 10) return `$${Math.floor(usd)}`;
  return `$${usd.toFixed(2)}`;
}

function PinnedButton() {
  const pinnedMessages = useChatStore((s) => s.pinnedMessages);
  const togglePinnedMenu = useChatStore((s) => s.togglePinnedMenu);
  const [bouncing, setBouncing] = useState(false);
  const prevCount = useRef(pinnedMessages.length);

  useEffect(() => {
    if (pinnedMessages.length > prevCount.current) {
      setBouncing(true);
      setTimeout(() => setBouncing(false), 600);
    }
    prevCount.current = pinnedMessages.length;
  }, [pinnedMessages.length]);

  if (pinnedMessages.length === 0) return null;

  return (
    <button
      onClick={togglePinnedMenu}
      className={`relative p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all
        ${bouncing ? 'animate-pin-bounce' : ''}`}
      aria-label="Pinned messages"
    >
      <span className="text-base">📌</span>
      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] font-bold
        bg-minai-500 text-white rounded-full flex items-center justify-center">
        {pinnedMessages.length}
      </span>
    </button>
  );
}

export function BalanceBar() {
  const session = useChatStore((s) => s.session);
  const toggleSidebar = useChatStore((s) => s.toggleSidebar);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);

  const balance = Number(session?.balance?.balance_usd ?? 0);
  const freeCredit = Number(session?.balance?.free_credit_usd ?? 0);
  const displayName = session?.user?.display_name;

  // Total "available" for the ring: free credit + paid balance
  const totalAvailable = freeCredit + balance;
  // Display: show free credit ring while it lasts, then paid balance ring
  const ringMax = freeCredit > 0 ? FREE_CREDIT_INITIAL_USD : Math.max(balance, 0.01);
  const ringValue = freeCredit > 0 ? freeCredit : balance;
  const remainingPct = Math.max(0, Math.min(100, (ringValue / ringMax) * 100));
  const ringColor = freeCredit > 0 ? getRemainingColor(remainingPct) : '#6366f1'; // purple when on paid

  const displayAmount = formatBalance(totalAvailable);

  return (
    <div className="sticky top-0 z-30 relative flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      {/* Left: Menu button */}
      <button
        onClick={toggleSidebar}
        className="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Toggle sidebar"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Center: Brand + Name */}
      <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-minai-600 pointer-events-none whitespace-nowrap flex items-center gap-1.5">
        <MinaiLogo className="w-5 h-5" />
        {displayName ? <>minai <span className="text-gray-400 font-normal">+</span> {displayName}</> : 'minai'}
      </span>

      {/* Right: Pinned + Balance ring + Top Up */}
      <div className="flex items-center gap-2">
        <PinnedButton />

        {/* Balance ring */}
        <div className="relative">
          <button
            onClick={() => setShowTooltip((v) => !v)}
            onBlur={() => setTimeout(() => setShowTooltip(false), 150)}
            className="relative w-12 h-12 flex items-center justify-center"
            aria-label="Balance"
          >
            <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90 absolute inset-0">
              <circle
                cx="18" cy="18" r="14"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="3.5"
                className="dark:stroke-gray-700"
              />
              <circle
                cx="18" cy="18" r="14"
                fill="none"
                stroke={ringColor}
                strokeWidth="3.5"
                strokeDasharray={`${remainingPct * 0.88} 88`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <span className="relative z-10 text-[10px] font-bold text-gray-700 dark:text-gray-200 leading-none">
              {displayAmount}
            </span>
          </button>

          {/* Tooltip */}
          {showTooltip && (
            <div className="absolute top-full right-0 mt-2 w-60 p-3 rounded-xl shadow-lg border
              bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 z-50 text-xs">
              {/* Total available */}
              <div className="font-semibold text-sm mb-0.5">Available Balance</div>
              <div className="text-xl font-bold mb-2.5">${totalAvailable.toFixed(2)}</div>

              {/* Breakdown */}
              {freeCredit > 0 && (
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">Free credit</span>
                  <span className="font-medium" style={{ color: ringColor }}>
                    ${freeCredit.toFixed(4)}
                  </span>
                </div>
              )}
              {freeCredit > 0 && (
                <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-1.5">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${remainingPct}%`, backgroundColor: ringColor }}
                  />
                </div>
              )}
              {balance > 0 && (
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">Paid balance</span>
                  <span className="font-medium">${balance.toFixed(2)}</span>
                </div>
              )}
              {freeCredit > 0 && balance === 0 && (
                <div className="text-gray-400 mt-1.5">
                  After free credit is used, top up to continue.
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowTopUp(true)}
          className="ml-1 px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors"
          title="Top up balance"
        >
          Top Up
        </button>
      </div>

      {showTopUp && <TopUpModal onClose={() => setShowTopUp(false)} />}
    </div>
  );
}
