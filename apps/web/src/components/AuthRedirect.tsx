'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/hooks/useChatStore';
import * as api from '@/lib/api';
import { detectWallet, connectWallet } from '@/lib/wallet';

/**
 * Handles auth redirect (logged-in users) + guest login button.
 * In MiniPay: auto-connects wallet and signs in without user interaction.
 * The landing page is a server component — this is the only client part.
 */
export function AuthRedirect() {
  const router = useRouter();
  const { checkSession, walletLogin, createConversation } = useChatStore();

  useEffect(() => {
    checkSession().then(() => {
      const { isAuthenticated } = useChatStore.getState();
      if (!isAuthenticated) {
        // If MiniPay detected, auto-login with wallet
        if (detectWallet() === 'minipay') {
          handleWalletLogin();
        }
        return;
      }

      api.getConversations().then((convs: { id: string }[]) => {
        if (convs.length > 0) {
          router.push(`/notebooks/${convs[0].id}/chat`);
        } else {
          createConversation().then((id) => router.push(`/notebooks/${id}/chat`));
        }
      });
    });

    async function handleWalletLogin() {
      try {
        const address = await connectWallet();
        const message = `Sign in to minai\nTimestamp: ${Date.now()}`;
        const signature = await window.ethereum!.request({
          method: 'personal_sign',
          params: [message, address],
        }) as string;

        await walletLogin(address, signature, message);
        const id = await createConversation();
        router.push(`/notebooks/${id}/chat`);
      } catch (err) {
        console.error('[Auth] MiniPay auto-login failed:', err);
        // Fall through — user will see the guest login button
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export function GuestLoginButton() {
  const router = useRouter();
  const { login, walletLogin, createConversation } = useChatStore();
  const [loading, setLoading] = useState(false);

  const isMiniPay = typeof window !== 'undefined' && detectWallet() === 'minipay';

  const handleLogin = async () => {
    setLoading(true);
    try {
      if (isMiniPay) {
        const address = await connectWallet();
        const message = `Sign in to minai\nTimestamp: ${Date.now()}`;
        const signature = await window.ethereum!.request({
          method: 'personal_sign',
          params: [message, address],
        }) as string;
        await walletLogin(address, signature, message);
      } else {
        await login();
      }
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
      ) : isMiniPay ? (
        'Sign in with MiniPay'
      ) : (
        'Continue as guest'
      )}
    </button>
  );
}
