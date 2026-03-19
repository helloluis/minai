'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/hooks/useChatStore';
import * as api from '@/lib/api';

/**
 * Invisible client component that checks auth and redirects logged-in users.
 * Renders nothing — the landing page content is server-rendered.
 */
export function AuthRedirect() {
  const router = useRouter();
  const { checkSession, createConversation } = useChatStore();

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
