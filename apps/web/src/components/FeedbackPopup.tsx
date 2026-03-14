'use client';

import { useState } from 'react';
import type { Message } from '@minai/shared';
import * as api from '@/lib/api';

interface FeedbackPopupProps {
  message: Message;
  previousUserMessage?: Message;
  onClose: () => void;
}

export function FeedbackPopup({ message, previousUserMessage, onClose }: FeedbackPopupProps) {
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.submitFeedback(message.conversation_id, message.id, {
        feedback_text: feedbackText || undefined,
        original_prompt: previousUserMessage?.content ?? '',
        original_response: message.content,
      });
      setSubmitted(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      console.error('[Feedback] Submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 p-5 rounded-xl shadow-xl
          bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div className="text-center py-4">
            <div className="text-2xl mb-2">✓</div>
            <p className="text-gray-600 dark:text-gray-300">Thank you for your feedback!</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Report an issue</h3>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              What went wrong with this response?
            </p>

            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="The response was inaccurate, unhelpful, or..."
              className="w-full h-32 px-3 py-2 text-sm rounded-lg border resize-none
                border-gray-200 dark:border-gray-600
                bg-white dark:bg-gray-900
                focus:outline-none focus:ring-2 focus:ring-minai-500"
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg
                  hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium rounded-lg
                  bg-red-500 text-white hover:bg-red-600
                  disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
