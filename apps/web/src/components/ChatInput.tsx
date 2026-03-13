'use client';

import { useState, useRef, useCallback } from 'react';
import type { LLMMode } from '@minai/shared';
import { useChatStore } from '@/hooks/useChatStore';

const MODES: { value: LLMMode; label: string; description: string }[] = [
  { value: 'auto', label: 'Auto', description: 'Automatically chooses the best model' },
  { value: 'fast', label: 'Fast', description: 'Qwen Flash — quick and cheap' },
  { value: 'deep', label: 'Deep', description: 'Qwen Plus — thorough reasoning' },
];

export function ChatInput() {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { mode, setMode, sendMessage, isStreaming } = useChatStore();

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 5 * 24; // 5 lines * ~24px line height
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          const trimmed = text.trim() || 'What is this image?';
          setText('');
          await sendMessage(trimmed, [base64]);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 pb-4 pt-2">
      {/* Mode selector */}
      <div className="flex gap-1 mb-2">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            title={m.description}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors
              ${mode === m.value
                ? 'bg-minai-100 text-minai-700 dark:bg-minai-900/40 dark:text-minai-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Type a message..."
          rows={1}
          disabled={isStreaming}
          className="flex-1 resize-none bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-2.5
            text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-minai-500/30
            disabled:opacity-50 max-h-[120px]"
        />

        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isStreaming}
          className="p-2.5 bg-minai-600 hover:bg-minai-700 disabled:bg-gray-300 dark:disabled:bg-gray-700
            text-white rounded-xl transition-colors flex-shrink-0"
        >
          {isStreaming ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
