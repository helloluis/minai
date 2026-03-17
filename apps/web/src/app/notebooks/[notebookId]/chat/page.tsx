'use client';

import { useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useChatStore } from '@/hooks/useChatStore';
import { BalanceBar } from '@/components/BalanceBar';
import { Sidebar } from '@/components/Sidebar';
import { ChatInput } from '@/components/ChatInput';
import { MessageBubble } from '@/components/MessageBubble';
import { ThinkingBlock } from '@/components/ThinkingBlock';
import { WelcomeMessage } from '@/components/WelcomeMessage';
import { PinnedMessagesMenu } from '@/components/PinnedMessagesMenu';

function AnimatedDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-0.5">
      <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

function StreamingPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-gray-400 text-sm">
      <span>{label}</span>
      <AnimatedDots />
    </div>
  );
}

export default function NotebookChatPage() {
  const params = useParams();
  const router = useRouter();
  const notebookId = params.notebookId as string;

  const {
    isAuthenticated,
    checkSession,
    messages,
    isStreaming,
    streamingContent,
    streamingThinking,
    streamingModel,
    streamingClassification,
    mode,
    activeConversationId,
    selectConversation,
    loadPinnedMessages,
    sidebarWidth,
    pendingNavigation,
    setPendingNavigation,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check auth
  useEffect(() => {
    checkSession().then(() => {
      if (!useChatStore.getState().isAuthenticated) {
        router.push('/');
      } else {
        loadPinnedMessages();
      }
    });
  }, [checkSession, router, loadPinnedMessages]);

  // Load conversation
  useEffect(() => {
    if (notebookId && notebookId !== activeConversationId) {
      selectConversation(notebookId);
    }
  }, [notebookId, activeConversationId, selectConversation]);

  // Handle AI-triggered navigation (e.g. after create_notebook tool)
  useEffect(() => {
    if (pendingNavigation) {
      setPendingNavigation(null);
      router.push(pendingNavigation);
    }
  }, [pendingNavigation, setPendingNavigation, router]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, streamingThinking]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  const hasMessages = messages.length > 0;

  const getPreviousUserMessage = (index: number) => {
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i];
    }
    return undefined;
  };

  function getStreamingBody() {
    if (streamingContent) {
      return (
        <>
          {streamingThinking && <ThinkingBlock content={streamingThinking} isActive={false} />}
          <div className="message-content leading-relaxed">
            {streamingContent}
            <span className="inline-block w-1.5 h-4 bg-minai-500 ml-0.5 animate-pulse" />
          </div>
        </>
      );
    }
    const classification = streamingClassification;
    const knownDeep = classification === 'deep' || (!classification && mode === 'deep');
    if (knownDeep) return <ThinkingBlock content={streamingThinking} isActive={true} />;
    if (classification === 'simple' || (!classification && mode === 'fast')) return <StreamingPlaceholder label="Processing" />;
    if (classification === 'balanced' || (!classification && mode === 'balanced')) return <StreamingPlaceholder label="Working" />;
    return <StreamingPlaceholder label="Classifying" />;
  }

  const contentMargin = sidebarWidth !== 'closed' ? 'lg:pl-72' : '';

  return (
    <div className={`flex flex-col h-screen transition-[padding] duration-200 ease-in-out ${contentMargin}`}>
      <BalanceBar />
      <Sidebar />
      <PinnedMessagesMenu />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-4">
          {!hasMessages && !isStreaming && <WelcomeMessage />}

          {messages.map((msg, index) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              prevMessage={index > 0 ? messages[index - 1] : undefined}
              previousUserMessage={msg.role === 'assistant' ? getPreviousUserMessage(index) : undefined}
            />
          ))}

          {isStreaming && (
            <div className="flex justify-start mb-3">
              <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-sm">
                {streamingModel && (
                  <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">
                    {streamingModel === 'qwen3.5-flash' ? 'Flash' : 'Plus'}
                  </div>
                )}
                {getStreamingBody()}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput />
    </div>
  );
}
