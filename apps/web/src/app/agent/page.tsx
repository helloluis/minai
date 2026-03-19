'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/hooks/useChatStore';
import PiChat from '@/components/PiChat';

export default function AgentPage() {
  const router = useRouter();
  const { isAuthenticated } = useChatStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return <PiChat />;
}
