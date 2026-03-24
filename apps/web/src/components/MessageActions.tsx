'use client';

import { useState, useRef, useEffect } from 'react';
import type { Message } from '@minai/shared';
import { useChatStore } from '@/hooks/useChatStore';
import { FeedbackPopup } from './FeedbackPopup';
import { NotebookPopup } from './NotebookPopup';
import { ShareDialog } from './ShareDialog';

interface MessageActionsProps {
  message: Message;
  previousUserMessage?: Message;
}

export function MessageActions({ message, previousUserMessage }: MessageActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [copied, setCopied] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const togglePinMessage = useChatStore((s) => s.togglePinMessage);
  const pinnedMessages = useChatStore((s) => s.pinnedMessages);

  useEffect(() => {
    const pinned = pinnedMessages.some((pm) => pm.message_id === message.id);
    setIsPinned(pinned);
  }, [pinnedMessages, message.id]);

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

  const handleShare = () => {
    setShareOpen(true);
    setMenuOpen(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = message.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    setMenuOpen(false);
  };

  const handleFeedback = () => {
    setFeedbackOpen(true);
    setMenuOpen(false);
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Message actions"
        >
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute top-0 py-1 w-44 rounded-lg shadow-lg border
            bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 z-50
            right-full mr-1.5 sm:right-auto sm:left-full sm:mr-0 sm:ml-1.5">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left
                hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
            <button
              onClick={handlePin}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left
                hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span className="text-xs">📌</span>
              <span>{isPinned ? 'Unpin' : 'Pin'}</span>
            </button>
            <button
              onClick={handleNotebook}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left
                hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span className="text-xs">📝</span>
              <span>Add to notebook</span>
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left
                hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>Share</span>
            </button>
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <button
              onClick={handleFeedback}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left
                hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-red-500"
            >
              <span className="text-xs">👎</span>
              <span>Report issue</span>
            </button>
          </div>
        )}
      </div>

      {notebookOpen && <NotebookPopup onClose={() => setNotebookOpen(false)} />}
      {feedbackOpen && (
        <FeedbackPopup
          message={message}
          previousUserMessage={previousUserMessage}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
      {shareOpen && (
        <ShareDialog
          message={message}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  );
}
