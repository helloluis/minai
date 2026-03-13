'use client';

import { useChatStore } from '@/hooks/useChatStore';

export function BalanceBar() {
  const session = useChatStore((s) => s.session);
  const toggleSidebar = useChatStore((s) => s.toggleSidebar);

  const balance = session?.balance?.balance_usd ?? 0;
  const freeTokens = session?.balance?.free_tokens_remaining ?? 0;
  // Max is whatever the server gives on signup — avoid dividing by 0
  const freeTokensPct = freeTokens > 0 ? Math.min(100, Math.round((freeTokens / (session?.balance?.free_tokens_remaining ?? 1)) * 100)) : 0;

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

      {/* Right: Balance */}
      <div className="flex items-center gap-2">
        {/* Mini pie chart for free tokens */}
        <div className="relative w-6 h-6" title={`${freeTokens} free tokens remaining`}>
          <svg viewBox="0 0 36 36" className="w-6 h-6 -rotate-90">
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
              stroke="#22c55e"
              strokeWidth="4"
              strokeDasharray={`${freeTokensPct * 0.88} 88`}
              strokeLinecap="round"
            />
          </svg>
        </div>

        <span className="text-sm font-medium">
          ${Number(balance).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
