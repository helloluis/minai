'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/hooks/useChatStore';

export function PinnedMessagesMenu() {
  const router = useRouter();
  const pinnedMessages = useChatStore((s) => s.pinnedMessages);
  const pinnedMenuOpen = useChatStore((s) => s.pinnedMenuOpen);
  const togglePinnedMenu = useChatStore((s) => s.togglePinnedMenu);
  const loadPinnedMessages = useChatStore((s) => s.loadPinnedMessages);

  useEffect(() => {
    if (pinnedMenuOpen) {
      loadPinnedMessages();
    }
  }, [pinnedMenuOpen, loadPinnedMessages]);

  const handleNavigate = (conversationId: string, messageId: string) => {
    router.push(`/notebooks/${conversationId}/chat#message-${messageId}`);
    togglePinnedMenu();

    // Scroll to message after navigation
    setTimeout(() => {
      const element = document.getElementById(`message-${messageId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash highlight effect
        element.classList.add('bg-minai-100', 'dark:bg-minai-900/30');
        setTimeout(() => {
          element.classList.remove('bg-minai-100', 'dark:bg-minai-900/30');
        }, 2000);
      }
    }, 100);
  };

  if (!pinnedMenuOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={togglePinnedMenu} />

      {/* Menu */}
      <div className="fixed top-12 right-4 w-80 max-h-96 overflow-y-auto rounded-xl shadow-lg border
        bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 z-50">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold">Pinned Messages</h3>
          <button
            onClick={togglePinnedMenu}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {pinnedMessages.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            No pinned messages yet
          </div>
        ) : (
          <div className="py-2">
            {pinnedMessages.map((pm) => (
              <button
                key={pm.id}
                onClick={() => handleNavigate(pm.conversation_id, pm.message_id)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="text-xs text-gray-400 mb-1">
                  {pm.model === 'qwen3.5-flash' ? 'Flash' : 'Plus'}
                </div>
                <div className="text-sm line-clamp-2">
                  {pm.content.slice(0, 100)}
                  {pm.content.length > 100 && '...'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
