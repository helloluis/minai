'use client';

import { useState } from 'react';
import type { Message } from '@minai/shared';
import { renderMarkdown } from './MessageBubble';
import { decorateHtml } from '@/lib/decorator';
import * as api from '@/lib/api';

interface ShareDialogProps {
  message: Message;
  onClose: () => void;
}

export function ShareDialog({ message, onClose }: ShareDialogProps) {
  const [state, setState] = useState<'composing' | 'ready' | 'error'>('composing');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Start recomposing on mount
  useState(() => {
    api.createShare(message.id)
      .then((data) => {
        setTitle(data.title);
        setContent(data.content);
        setShareUrl(data.url);
        setState('ready');
      })
      .catch((err) => {
        setError(err.message || 'Failed to create share');
        setState('error');
      });
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-4 rounded-xl shadow-xl
          bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold">Share Post</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {state === 'composing' && (
          <div className="flex flex-col items-center justify-center py-16 px-5">
            <div className="w-6 h-6 border-2 border-minai-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-500">Re-composing for sharing...</p>
            <p className="text-xs text-gray-400 mt-1">Removing conversational filler to make it more to-the-point.</p>
          </div>
        )}

        {state === 'error' && (
          <div className="py-12 px-5 text-center">
            <p className="text-red-500 text-sm">{error}</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700">
              Close
            </button>
          </div>
        )}

        {state === 'ready' && (
          <>
            {/* Title */}
            <div className="px-5 pt-4">
              <label className="text-xs text-gray-500 mb-1 block">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm font-medium rounded-lg border
                  border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900
                  focus:outline-none focus:ring-2 focus:ring-minai-500/30"
              />
            </div>

            {/* Info */}
            <div className="px-5 pt-2">
              <p className="text-xs text-gray-400">
                This post has been re-composed to remove conversational filler and present just the facts.
              </p>
            </div>

            {/* Preview */}
            <div className="px-5 pt-3 pb-4">
              <label className="text-xs text-gray-500 mb-1 block">Preview</label>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700
                bg-gray-50 dark:bg-gray-900 px-4 py-3">
                <div
                  className="message-content text-sm"
                  dangerouslySetInnerHTML={{ __html: decorateHtml(renderMarkdown(content)) }}
                />
              </div>
            </div>

            {/* Share URL + actions */}
            <div className="px-5 pb-5 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 text-xs rounded-lg border
                  border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900
                  text-gray-500 select-all"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopy}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors
                  ${copied
                    ? 'bg-green-500 text-white'
                    : 'bg-minai-600 text-white hover:bg-minai-700'
                  }`}
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
