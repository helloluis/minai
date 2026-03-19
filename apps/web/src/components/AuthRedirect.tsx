'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/hooks/useChatStore';
import * as api from '@/lib/api';

/**
 * Handles auth redirect (logged-in users) + guest login button.
 * The landing page is a server component — this is the only client part.
 */
export function AuthRedirect() {
  const router = useRouter();
  const { checkSession, login, createConversation } = useChatStore();

  useEffect(() => {
    checkSession().then(() => {
      const { isAuthenticated } = useChatStore.getState();
      if (!isAuthenticated) return;

      api.getConversations().then((convs: { id: string }[]) => {
        if (convs.length > 0) {
          router.push(`/notebooks/${convs[0].id}/chat`);
        } else {
          createConversation().then((id) => router.push(`/notebooks/${id}/chat`));
        }
      });
    });
  }, [checkSession, createConversation, router]);

  return null;
}

export function GuestLoginButton() {
  const router = useRouter();
  const { login, createConversation } = useChatStore();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await login();
      const id = await createConversation();
      router.push(`/notebooks/${id}/chat`);
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogin}
      disabled={loading}
      className="w-full py-3 px-6 bg-white/10 hover:bg-white/20
        border border-white/20
        text-white/70 font-medium rounded-xl transition-colors
        flex items-center justify-center gap-3 text-sm"
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      ) : (
        'Continue without account'
      )}
    </button>
  );
}
