'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useChatStore } from '@/hooks/useChatStore';
import { BalanceBar } from '@/components/BalanceBar';
import { Sidebar } from '@/components/Sidebar';
import { ChatInput } from '@/components/ChatInput';
import { MessageBubble } from '@/components/MessageBubble';
import { ThinkingBlock } from '@/components/ThinkingBlock';
import { WelcomeMessage } from '@/components/WelcomeMessage';
import { PinnedMessagesMenu } from '@/components/PinnedMessagesMenu';
import { GuestBanner } from '@/components/GuestBanner';
import { FileViewer } from '@/components/FileViewer';
import { SectionSkipper } from '@/components/SectionSkipper';
import { useSectionSkipper } from '@/hooks/useSectionSkipper';
import * as api from '@/lib/api';

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
    hasMoreMessages,
    isLoadingMore,
    loadOlderMessages,
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
    generatedFileId,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [viewingFile, setViewingFile] = useState<api.NotebookFile | null>(null);
  // Track whether user has manually scrolled away from bottom
  const isNearBottomRef = useRef(true);

  // Section skipper for long messages
  const { currentSection, skipperVisible, scrollToSection } = useSectionSkipper(scrollContainerRef, isStreaming);

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

  // Handle AI-triggered navigation
  useEffect(() => {
    if (pendingNavigation) {
      setPendingNavigation(null);
      router.push(pendingNavigation);
    }
  }, [pendingNavigation, setPendingNavigation, router]);

  // Auto-open FileViewer when a document is generated
  useEffect(() => {
    if (generatedFileId && notebookId) {
      api.getFiles(notebookId).then((files) => {
        const file = files.find((f) => f.id === generatedFileId);
        if (file) setViewingFile(file);
      }).catch(console.error);
      useChatStore.setState({ generatedFileId: null });
    }
  }, [generatedFileId, notebookId]);

  // Restore saved scroll position on load, or zip to bottom
  const hasRestoredScroll = useRef(false);
  useEffect(() => {
    if (hasRestoredScroll.current || messages.length === 0) return;
    hasRestoredScroll.current = true;

    const el = scrollContainerRef.current;
    if (!el) return;

    const saved = sessionStorage.getItem(`scroll:${notebookId}`);
    if (saved) {
      // Restore to saved position (use requestAnimationFrame to wait for render)
      requestAnimationFrame(() => {
        el.scrollTop = parseInt(saved);
      });
    } else {
      // No saved position — go to bottom
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, notebookId]);

  // Reset restore flag when switching conversations
  useEffect(() => {
    hasRestoredScroll.current = false;
  }, [notebookId]);

  // When user sends a message (streaming starts), scroll to bottom
  useEffect(() => {
    if (isStreaming) {
      isNearBottomRef.current = true;
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [isStreaming]);

  // Auto-scroll to bottom during streaming if user hasn't scrolled away
  useEffect(() => {
    if (!hasRestoredScroll.current) return; // don't fight the restore
    if (isNearBottomRef.current) {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingContent, streamingThinking]);

  // Track scroll position for "scroll to bottom" button and infinite scroll
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distFromBottom < 100;

    // Save scroll position per conversation
    sessionStorage.setItem(`scroll:${notebookId}`, String(el.scrollTop));

    // Show scroll-down arrow when user is more than 1 viewport height from bottom
    setShowScrollDown(distFromBottom > el.clientHeight);

    // Load older messages when scrolled near the top
    if (el.scrollTop < 200 && hasMoreMessages && !isLoadingMore) {
      const prevHeight = el.scrollHeight;
      loadOlderMessages().then(() => {
        // Preserve scroll position after prepending older messages
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - prevHeight;
        });
      });
    }
  }, [hasMoreMessages, isLoadingMore, loadOlderMessages]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

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
      <GuestBanner />
      <Sidebar />
      <PinnedMessagesMenu />

      {/* Auto-opened FileViewer for generated documents */}
      {viewingFile && (
        <FileViewer
          file={viewingFile}
          conversationId={notebookId}
          onClose={() => setViewingFile(null)}
        />
      )}

      <div className="flex-1 relative overflow-hidden">
      {/* Section skipper — positioned relative to the scroll area */}
      <SectionSkipper
        currentSection={currentSection}
        visible={skipperVisible}
        onJump={scrollToSection}
      />
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto"
        onScroll={handleScroll}
      >
        <div className="max-w-3xl mx-auto px-4 py-4">
          {/* Loading older messages indicator */}
          {isLoadingMore && (
            <div className="flex justify-center py-3">
              <span className="text-xs text-gray-400">Loading older messages…</span>
            </div>
          )}

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
      </div>

      {/* Scroll-to-bottom floating button */}
      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 right-6 z-20 w-10 h-10 rounded-full
            bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900
            shadow-lg flex items-center justify-center
            hover:bg-gray-700 dark:hover:bg-gray-300
            transition-all duration-200 animate-fade-in"
          aria-label="Scroll to bottom"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}

      <ChatInput />
    </div>
  );
}
