'use client';

import { useState } from 'react';
import { useChatStore } from '@/hooks/useChatStore';
import { FREE_TOKENS_INITIAL } from '@minai/shared';

function getRemainingColor(remainingPct: number): string {
  if (remainingPct <= 10) return '#ef4444'; // red
  if (remainingPct <= 25) return '#f97316'; // orange
  if (remainingPct <= 35) return '#eab308'; // yellow
  return '#22c55e'; // green
}

function PinnedButton() {
  const pinnedMessages = useChatStore((s) => s.pinnedMessages);
  const togglePinnedMenu = useChatStore((s) => s.togglePinnedMenu);

  if (pinnedMessages.length === 0) return null;

  return (
    <button
      onClick={togglePinnedMenu}
      className="relative p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
  const deposit = useChatStore((s) => s.deposit);
  const [depositing, setDepositing] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const balance = session?.balance?.balance_usd ?? 0;
  const freeTokens = session?.balance?.free_tokens_remaining ?? 0;
  const usedTokens = FREE_TOKENS_INITIAL - freeTokens;
  const remainingPct = Math.max(0, Math.round((freeTokens / FREE_TOKENS_INITIAL) * 100));
  const ringColor = getRemainingColor(remainingPct);

  const handleDeposit = async () => {
    setDepositing(true);
    try {
      await deposit();
    } catch (err) {
      console.error('[BalanceBar] Deposit failed:', err);
    } finally {
      setDepositing(false);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
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

      {/* Center: Brand */}
      <span className="font-semibold text-minai-600">Minai</span>

      {/* Right: Pinned + Balance + Deposit */}
      <div className="flex items-center gap-2">
        {/* Pinned messages button */}
        <PinnedButton />

        {/* Mini pie chart for free tokens */}
        <div className="relative">
          <button
            onClick={() => setShowTooltip((v) => !v)}
            onBlur={() => setShowTooltip(false)}
            className="relative w-7 h-7 flex items-center justify-center"
            aria-label="Free token usage"
          >
            <svg viewBox="0 0 36 36" className="w-7 h-7 -rotate-90">
              <circle
                cx="18" cy="18" r="14"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="4"
                className="dark:stroke-gray-700"
              />
              <circle
                cx="18" cy="18" r="14"
                fill="none"
                stroke={ringColor}
                strokeWidth="4"
                strokeDasharray={`${remainingPct * 0.88} 88`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-gray-500 dark:text-gray-400">
              {remainingPct}
            </span>
          </button>

          {/* Tooltip */}
          {showTooltip && (
            <div className="absolute top-full right-0 mt-2 w-56 p-3 rounded-xl shadow-lg border
              bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 z-50 text-xs">
              <div className="font-semibold text-sm mb-2">Free Token Allocation</div>
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">Used</span>
                <span className="font-medium">{usedTokens.toLocaleString()} tokens</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-500">Remaining</span>
                <span className="font-medium" style={{ color: ringColor }}>{freeTokens.toLocaleString()} tokens</span>
              </div>
              {/* Progress bar — shows remaining */}
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${remainingPct}%`, backgroundColor: ringColor }}
                />
              </div>
              <div className="text-gray-400 mt-2">
                {freeTokens > 0
                  ? `${remainingPct}% of your ${FREE_TOKENS_INITIAL.toLocaleString()} free tokens remaining. After that, usage is charged from your balance.`
                  : 'Free tokens exhausted. Usage is now charged from your balance.'}
              </div>
            </div>
          )}
        </div>

        <span className="text-sm font-medium">
          ${Number(balance).toFixed(2)}
        </span>

        {/* Mock deposit button */}
        <button
          onClick={handleDeposit}
          disabled={depositing}
          className="ml-1 px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
          title="Add $0.10 (mock deposit)"
        >
          {depositing ? '...' : '+$'}
        </button>
      </div>
    </div>
  );
}
