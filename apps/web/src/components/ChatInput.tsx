'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { LLMMode } from '@minai/shared';
import { useChatStore } from '@/hooks/useChatStore';
import { FlashIcon, BalancedIcon, DeepIcon, AutoIcon } from './ModeIcons';
import { uploadFile } from '@/lib/api';

const MODES: { value: LLMMode; label: string; description: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { value: 'auto', label: 'Auto', description: 'Automatically chooses the best model', icon: AutoIcon },
  { value: 'fast', label: 'Fast', description: 'Qwen Flash — quick and cheap', icon: FlashIcon },
  { value: 'balanced', label: 'Balanced', description: 'Qwen Plus — capable, no deep reasoning', icon: BalancedIcon },
  { value: 'deep', label: 'Deep', description: 'Qwen Plus — extended reasoning', icon: DeepIcon },
];

const MAX_HISTORY = 10;
const DRAFT_KEY = 'minai-draft';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const DOC_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/html',
]);

interface StagedDoc {
  name: string;
  uploading: boolean;
  error?: string;
}

export function ChatInput() {
  const [text, setText] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(DRAFT_KEY) ?? '';
    }
    return '';
  });
  const [stagedImages, setStagedImages] = useState<string[]>([]);
  const [stagedDocs, setStagedDocs] = useState<StagedDoc[]>([]);
  const [fileError, setFileError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyIndexRef = useRef(-1);
  const savedDraftRef = useRef('');
  const { mode, setMode, sendMessage, isStreaming, messages, streamError, activeConversationId } = useChatStore();

  // Persist draft
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, text);
  }, [text]);

  useEffect(() => {
    if (text) setTimeout(() => adjustHeight(), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 5 * 24;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  const userHistory = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .slice(-MAX_HISTORY)
    .reverse();

  // ─── File handling ──────────────────────────────────────────────────────

  const handleFiles = useCallback((files: FileList | File[]) => {
    setFileError('');
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        setFileError(`"${file.name}" exceeds 20 MB limit`);
        return;
      }

      if (IMAGE_TYPES.has(file.type)) {
        // Stage images as base64 for multimodal LLM
        const reader = new FileReader();
        reader.onload = () => setStagedImages((prev) => [...prev, reader.result as string]);
        reader.onerror = () => setFileError('Failed to read image');
        reader.readAsDataURL(file);
      } else if (DOC_TYPES.has(file.type) || file.name.match(/\.(pdf|docx?|txt|csv|md)$/i)) {
        // Upload documents to server immediately
        if (!activeConversationId) {
          setFileError('No active conversation — send a message first');
          return;
        }
        const docName = file.name;
        setStagedDocs((prev) => [...prev, { name: docName, uploading: true }]);

        uploadFile(activeConversationId, file)
          .then(() => {
            setStagedDocs((prev) =>
              prev.map((d) => d.name === docName ? { ...d, uploading: false } : d)
            );
            // Auto-remove after 3s
            setTimeout(() => {
              setStagedDocs((prev) => prev.filter((d) => d.name !== docName));
            }, 3000);
          })
          .catch((err) => {
            setStagedDocs((prev) =>
              prev.map((d) => d.name === docName ? { ...d, uploading: false, error: err.message } : d)
            );
          });
      } else {
        setFileError(`Unsupported file type: ${file.type || file.name.split('.').pop()}`);
      }
    }
  }, [activeConversationId]);

  const removeImage = useCallback((index: number) => {
    setStagedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ─── Submit ─────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if ((!trimmed && stagedImages.length === 0) || isStreaming) return;

    const images = stagedImages.length > 0 ? [...stagedImages] : undefined;
    const message = trimmed || 'What is this image?';

    setText('');
    setStagedImages([]);
    setFileError('');
    historyIndexRef.current = -1;
    savedDraftRef.current = '';
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    if (images && mode !== 'deep') setMode('deep');
    await sendMessage(message, images);
  };

  // ─── Keyboard ───────────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === 'ArrowUp' && userHistory.length > 0) {
      const ta = textareaRef.current;
      if (ta && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        e.preventDefault();
        if (historyIndexRef.current === -1) savedDraftRef.current = text;
        const next = Math.min(historyIndexRef.current + 1, userHistory.length - 1);
        historyIndexRef.current = next;
        setText(userHistory[next]);
        setTimeout(() => adjustHeight(), 0);
      }
      return;
    }
    if (e.key === 'ArrowDown' && historyIndexRef.current >= 0) {
      const ta = textareaRef.current;
      if (ta && ta.selectionStart === ta.value.length) {
        e.preventDefault();
        const next = historyIndexRef.current - 1;
        if (next < 0) { historyIndexRef.current = -1; setText(savedDraftRef.current); }
        else { historyIndexRef.current = next; setText(userHistory[next]); }
        setTimeout(() => adjustHeight(), 0);
      }
      return;
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/') || DOC_TYPES.has(item.type)) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      handleFiles(files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
    e.target.value = '';
  };

  // ─── Drag and drop ──────────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 pb-4 pt-2"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="max-w-3xl mx-auto relative">
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-minai-500 bg-minai-50/80 dark:bg-minai-900/30 pointer-events-none">
          <span className="text-sm font-medium text-minai-600">Drop file here</span>
        </div>
      )}

      {/* Mode selector */}
      <div className="flex gap-1 mb-2">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            title={m.description}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors flex items-center gap-1
              ${mode === m.value
                ? 'bg-minai-100 text-minai-700 dark:bg-minai-900/40 dark:text-minai-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
          >
            <m.icon size={12} />
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
          <div className="text-[10px] text-gray-400 self-end pb-1">Will use Deep mode (multimodal)</div>
        </div>
      )}

      {/* Staged document chips */}
      {stagedDocs.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {stagedDocs.map((doc) => (
            <div
              key={doc.name}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border ${
                doc.error
                  ? 'border-red-300 bg-red-50 dark:bg-red-900/20 text-red-600'
                  : doc.uploading
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500'
                  : 'border-green-300 bg-green-50 dark:bg-green-900/20 text-green-600'
              }`}
            >
              {doc.uploading && (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {!doc.uploading && !doc.error && <span>✓</span>}
              {doc.error && <span>✕</span>}
              <span className="truncate max-w-[150px]">{doc.name}</span>
              {doc.error && <span className="text-[10px]">{doc.error}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Errors */}
      {(fileError || streamError) && (
        <div className="text-xs text-red-500 mb-1">{fileError || streamError}</div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2">
        {/* Hidden file input — accepts images + documents */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.txt,.csv,.md"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Paperclip attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming}
          title="Attach file (max 20 MB)"
          className="p-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
            disabled:opacity-50 transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); adjustHeight(); }}
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
