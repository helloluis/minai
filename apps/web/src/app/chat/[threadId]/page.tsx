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

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const threadId = params.threadId as string;

  const {
    isAuthenticated,
    checkSession,
    messages,
    isStreaming,
    streamingContent,
    streamingThinking,
    streamingModel,
    activeConversationId,
    selectConversation,
    loadPinnedMessages,
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
    if (threadId && threadId !== activeConversationId) {
      selectConversation(threadId);
    }
  }, [threadId, activeConversationId, selectConversation]);

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

  // Get the previous user message for feedback context
  const getPreviousUserMessage = (index: number) => {
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i];
      }
    }
    return undefined;
  };

  return (
    <div className="flex flex-col h-screen">
      <BalanceBar />
      <Sidebar />
      <PinnedMessagesMenu />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-4">
          {!hasMessages && !isStreaming && <WelcomeMessage />}

          {messages.map((msg, index) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              previousUserMessage={msg.role === 'assistant' ? getPreviousUserMessage(index) : undefined}
            />
          ))}

          {/* Streaming assistant response */}
          {isStreaming && (
            <div className="flex justify-start mb-3">
              <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-sm">
                {/* Model badge */}
                {streamingModel && (
                  <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">
                    {streamingModel === 'qwen3.5-flash' ? 'Flash' : 'Plus'}
                  </div>
                )}

                {/* Thinking block */}
                {streamingThinking && (
                  <ThinkingBlock content={streamingThinking} isActive={!streamingContent} />
                )}

                {/* Streaming content */}
                {streamingContent ? (
                  <div className="message-content leading-relaxed">
                    {streamingContent}
                    <span className="inline-block w-1.5 h-4 bg-minai-500 ml-0.5 animate-pulse" />
                  </div>
                ) : !streamingThinking ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : null}
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
