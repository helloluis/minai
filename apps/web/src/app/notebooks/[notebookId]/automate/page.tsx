'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useChatStore } from '@/hooks/useChatStore';
import { BalanceBar } from '@/components/BalanceBar';
import { Sidebar } from '@/components/Sidebar';
import { PinnedMessagesMenu } from '@/components/PinnedMessagesMenu';
import PiChat from '@/components/PiChat';

export default function AutomatePage() {
  const params = useParams();
  const router = useRouter();
  const notebookId = params.notebookId as string;

  const {
    isAuthenticated,
    checkSession,
    activeConversationId,
    selectConversation,
    sidebarWidth,
  } = useChatStore();

  useEffect(() => {
    checkSession().then(() => {
      if (!useChatStore.getState().isAuthenticated) {
        router.push('/');
      }
    });
  }, [checkSession, router]);

  useEffect(() => {
    if (notebookId && notebookId !== activeConversationId) {
      selectConversation(notebookId);
    }
  }, [notebookId, activeConversationId, selectConversation]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  const contentMargin = sidebarWidth !== 'closed' ? 'lg:pl-72' : '';

  return (
    <div className={`flex flex-col h-screen transition-[padding] duration-200 ease-in-out ${contentMargin}`}>
      <BalanceBar />
      <Sidebar />
      <PinnedMessagesMenu />
      <div className="flex-1 overflow-hidden">
        <PiChat conversationId={notebookId} />
      </div>
    </div>
  );
}
