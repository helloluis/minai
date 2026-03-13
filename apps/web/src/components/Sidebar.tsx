'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/hooks/useChatStore';

export function Sidebar() {
  const router = useRouter();
  const {
    conversations,
    activeConversationId,
    sidebarOpen,
    toggleSidebar,
    loadConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    updateConversation,
  } = useChatStore();

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleNew = async () => {
    const id = await createConversation();
    router.push(`/chat/${id}`);
    toggleSidebar();
  };

  const handleSelect = async (id: string) => {
    await selectConversation(id);
    router.push(`/chat/${id}`);
    toggleSidebar();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteConversation(id);
  };

  const handlePin = async (e: React.MouseEvent, id: string, currentlyPinned: boolean) => {
    e.stopPropagation();
    await updateConversation(id, { pinned: !currentlyPinned });
  };

  return (
    <>
      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={`fixed left-0 top-0 bottom-0 w-72 bg-white dark:bg-gray-950 border-r border-gray-200
          dark:border-gray-800 z-50 transform transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <span className="font-semibold text-minai-600">Conversations</span>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New conversation button */}
        <div className="p-3">
          <button
            onClick={handleNew}
            className="w-full py-2 px-3 text-sm font-medium text-minai-600 border border-minai-200
              dark:border-minai-800 rounded-lg hover:bg-minai-50 dark:hover:bg-minai-950/30 transition-colors"
          >
            + New conversation
          </button>
        </div>

        {/* Conversation list */}
        <div className="overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 120px)' }}>
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => handleSelect(conv.id)}
              className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer text-sm transition-colors
                ${conv.id === activeConversationId
                  ? 'bg-minai-50 dark:bg-minai-950/30 text-minai-700 dark:text-minai-400'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-900'
                }`}
            >
              {/* Pin indicator */}
              {conv.pinned && (
                <span className="text-xs text-amber-500 flex-shrink-0">📌</span>
              )}

              {/* Title */}
              <span className="truncate flex-1">{conv.title}</span>

              {/* Actions */}
              <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => handlePin(e, conv.id, conv.pinned)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
                  title={conv.pinned ? 'Unpin' : 'Pin'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
                  title="Delete"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {conversations.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">No conversations yet</p>
          )}
        </div>
      </div>
    </>
  );
}
