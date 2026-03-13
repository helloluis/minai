'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/hooks/useChatStore';

export default function LandingPage() {
  const router = useRouter();
  const { login, checkSession, isAuthenticated, createConversation } = useChatStore();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkSession().finally(() => setChecking(false));
  }, [checkSession]);

  useEffect(() => {
    if (isAuthenticated && !checking) {
      // Already logged in, redirect to chat
      createConversation().then((id) => {
        router.push(`/chat/${id}`);
      });
    }
  }, [isAuthenticated, checking, createConversation, router]);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await login();
      const id = await createConversation();
      router.push(`/chat/${id}`);
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="text-center max-w-md">
        {/* Logo / Brand */}
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-minai-600 mb-2">Minai</h1>
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            Frontier AI for everyone
          </p>
        </div>

        {/* Description */}
        <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
          Pay-as-you-go, fractional pricing. Up to 95% cheaper than
          other frontier models. Top up with as little as $0.10.
        </p>

        {/* Login Button */}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-4 px-6 bg-minai-600 hover:bg-minai-700 disabled:bg-minai-400
            text-white font-semibold rounded-xl text-lg transition-colors
            flex items-center justify-center gap-3"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Login via MiniPay
            </>
          )}
        </button>

        <p className="text-xs text-gray-400 mt-4">
          Demo mode — creates a session instantly
        </p>
      </div>
    </div>
  );
}
