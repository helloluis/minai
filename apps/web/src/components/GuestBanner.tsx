'use client';

import { useChatStore } from '@/hooks/useChatStore';

export function GuestBanner() {
  const session = useChatStore((s) => s.session);

  // Only show for unauthenticated users (no google_id)
  if (!session || session.user?.google_id) return null;

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800/50 px-4 py-2 text-xs text-yellow-800 dark:text-yellow-300 flex items-center justify-center gap-2">
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <span>
        You&apos;re using minai as a guest. Your session may be lost when you close your browser.{' '}
        <a href="/api/auth/google" className="font-semibold underline hover:text-yellow-900 dark:hover:text-yellow-200">
          Sign in with Google
        </a>
        {' '}to keep your conversations.
      </span>
    </div>
  );
}
