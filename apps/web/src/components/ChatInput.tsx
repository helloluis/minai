'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { LLMMode } from '@minai/shared';
import { useChatStore } from '@/hooks/useChatStore';

const MODES: { value: LLMMode; label: string; description: string }[] = [
  { value: 'auto', label: 'Auto', description: 'Automatically chooses the best model' },
  { value: 'fast', label: 'Fast', description: 'Qwen Flash — quick and cheap' },
  { value: 'deep', label: 'Deep', description: 'Qwen Plus — thorough reasoning' },
];

const MAX_HISTORY = 10;
const DRAFT_KEY = 'minai-draft';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export function ChatInput() {
  const [text, setText] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(DRAFT_KEY) ?? '';
    }
    return '';
  });
  const [stagedImages, setStagedImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyIndexRef = useRef(-1);
  const savedDraftRef = useRef('');
  const { mode, setMode, sendMessage, isStreaming, messages, streamError } = useChatStore();

  // Persist draft to localStorage as the user types
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, text);
  }, [text]);

  // Restore textarea height on mount if there's a saved draft
  useEffect(() => {
    if (text) {
      setTimeout(() => adjustHeight(), 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 5 * 24; // 5 lines * ~24px line height
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  // Recent user messages for Up/Down arrow recall
  const userHistory = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .slice(-MAX_HISTORY)
    .reverse(); // most recent first

  const addImages = useCallback((files: FileList | File[]) => {
    setImageError('');
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        setImageError(`"${file.name}" exceeds 20 MB limit`);
        return;
      }
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        setStagedImages((prev) => [...prev, reader.result as string]);
      };
      reader.onerror = () => {
        setImageError('Failed to read image file');
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setStagedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if ((!trimmed && stagedImages.length === 0) || isStreaming) return;

    const images = stagedImages.length > 0 ? [...stagedImages] : undefined;
    const message = trimmed || 'What is this image?';

    setText('');
    setStagedImages([]);
    setImageError('');
    historyIndexRef.current = -1;
    savedDraftRef.current = '';
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Auto-switch to Deep mode for images (Qwen Plus is the only multimodal model)
    if (images && mode !== 'deep') {
      setMode('deep');
    }

    await sendMessage(message, images);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Up arrow: recall older messages (only when cursor is at position 0)
    if (e.key === 'ArrowUp' && userHistory.length > 0) {
      const textarea = textareaRef.current;
      if (textarea && textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
        e.preventDefault();
        if (historyIndexRef.current === -1) {
          savedDraftRef.current = text;
        }
        const nextIndex = Math.min(historyIndexRef.current + 1, userHistory.length - 1);
        historyIndexRef.current = nextIndex;
        setText(userHistory[nextIndex]);
        setTimeout(() => adjustHeight(), 0);
      }
      return;
    }

    // Down arrow: recall newer messages or restore draft
    if (e.key === 'ArrowDown' && historyIndexRef.current >= 0) {
      const textarea = textareaRef.current;
      if (textarea) {
        const atEnd = textarea.selectionStart === textarea.value.length;
        if (atEnd) {
          e.preventDefault();
          const nextIndex = historyIndexRef.current - 1;
          if (nextIndex < 0) {
            historyIndexRef.current = -1;
            setText(savedDraftRef.current);
          } else {
            historyIndexRef.current = nextIndex;
            setText(userHistory[nextIndex]);
          }
          setTimeout(() => adjustHeight(), 0);
        }
      }
      return;
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImages(imageFiles);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addImages(e.target.files);
    }
    // Reset so the same file can be selected again
    e.target.value = '';
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
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

      {/* Staged image previews */}
      {stagedImages.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {stagedImages.map((src, i) => (
            <div key={i} className="relative group">
              <img
                src={src}
                alt={`Staged ${i + 1}`}
                className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full
                  text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
          <div className="text-[10px] text-gray-400 self-end pb-1">
            Will use Deep mode (multimodal)
          </div>
        </div>
      )}

      {/* Errors */}
      {(imageError || streamError) && (
        <div className="text-xs text-red-500 mb-1">{imageError || streamError}</div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Image upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming}
          title="Upload image (max 20 MB)"
          className="p-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
            disabled:opacity-50 transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={stagedImages.length > 0 ? "Describe the image, or send as-is..." : "Type a message..."}
          rows={1}
          disabled={isStreaming}
          className="flex-1 resize-none bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-2.5
            text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-minai-500/30
            disabled:opacity-50 max-h-[120px]"
        />

        <button
          onClick={handleSubmit}
          disabled={(!text.trim() && stagedImages.length === 0) || isStreaming}
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
    </div>
  );
}
