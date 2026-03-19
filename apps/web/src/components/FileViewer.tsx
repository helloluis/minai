'use client';

import { useEffect, useCallback } from 'react';
import type { NotebookFile } from '@/lib/api';
import { getFileDownloadUrl } from '@/lib/api';

interface FileViewerProps {
  file: NotebookFile;
  conversationId: string;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileViewer({ file, conversationId, onClose }: FileViewerProps) {
  const downloadUrl = getFileDownloadUrl(conversationId, file.id);
  const isImage = file.mime_type.startsWith('image/');
  const isPdf = file.mime_type === 'application/pdf';

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] mx-4 bg-white dark:bg-gray-900 rounded-2xl
          shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{file.display_name}</div>
            <div className="text-xs text-gray-400">{formatSize(file.file_size)}</div>
          </div>
          <a
            href={downloadUrl}
            download={file.original_name}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500"
            title="Download"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {isImage && (
            <div className="flex items-center justify-center p-4">
              <img
                src={downloadUrl}
                alt={file.display_name}
                className="max-w-full max-h-[75vh] object-contain rounded-lg"
              />
            </div>
          )}

          {isPdf && (
            <iframe
              src={downloadUrl}
              title={file.display_name}
              className="w-full h-[80vh]"
            />
          )}

          {!isImage && !isPdf && (
            <div className="p-5 text-sm">
              <div className="flex items-center gap-2 mb-4 text-gray-400">
                <span>{getFileIcon(file.mime_type)}</span>
                <span>{file.original_name}</span>
                {file.parse_status === 'pending' && <span className="text-yellow-500">Parsing...</span>}
                {file.parse_status === 'failed' && <span className="text-red-500">Parse failed</span>}
              </div>
              <div className="text-center py-8 text-gray-400">
                <p className="mb-3">Preview not available for this file type.</p>
                <a
                  href={downloadUrl}
                  download={file.original_name}
                  className="text-minai-600 hover:underline"
                >
                  Download original file
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function getFileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📕';
  if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') return '📘';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'text/csv') return '📊';
  return '📄';
}
