'use client';

import { useState, useRef, useEffect } from 'react';
import type { Message } from '@minai/shared';
import { useChatStore } from '@/hooks/useChatStore';
import { FeedbackPopup } from './FeedbackPopup';
import { NotebookPopup } from './NotebookPopup';

interface MessageActionsProps {
  message: Message;
  previousUserMessage?: Message;
}

export function MessageActions({ message, previousUserMessage }: MessageActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const togglePinMessage = useChatStore((s) => s.togglePinMessage);
  const pinnedMessages = useChatStore((s) => s.pinnedMessages);

  // Check if this message is pinned
  useEffect(() => {
    const pinned = pinnedMessages.some((pm) => pm.message_id === message.id);
    setIsPinned(pinned);
  }, [pinnedMessages, message.id]);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePin = async () => {
    const newPinned = await togglePinMessage(message.id);
    setIsPinned(newPinned);
    setMenuOpen(false);
  };

  const handleNotebook = () => {
    setNotebookOpen(true);
    setMenuOpen(false);
  };

  const handleFeedback = () => {
    setFeedbackOpen(true);
    setMenuOpen(false);
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        {/* Three-dot menu button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="p-1 rounded-lg
            hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Message actions"
        >
          <svg className="w-3.5 h-3.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="absolute left-0 top-full mt-1 py-1 w-40 rounded-lg shadow-lg border
            bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 z-50">
            <button
              onClick={handlePin}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left
                hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span>📌</span>
              <span>{isPinned ? 'Unpin' : 'Pin'}</span>
            </button>
            <button
              onClick={handleNotebook}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left
                hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span>📝</span>
              <span>Add to notebook</span>
            </button>
            <button
              onClick={handleFeedback}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left
                hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-red-500"
            >
              <span>👎</span>
              <span>Report issue</span>
            </button>
          </div>
        )}
      </div>

      {/* Popups */}
      {notebookOpen && <NotebookPopup onClose={() => setNotebookOpen(false)} />}
      {feedbackOpen && (
        <FeedbackPopup
          message={message}
          previousUserMessage={previousUserMessage}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
    </>
  );
}
