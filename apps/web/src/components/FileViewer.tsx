'use client';

import { useEffect, useCallback, useState } from 'react';
import type { NotebookFile } from '@/lib/api';
import { getFileDownloadUrl, getFilePreview } from '@/lib/api';

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
  const viewUrl = downloadUrl + '?inline=1';
  const isImage = file.mime_type.startsWith('image/');
  const isPdf = file.mime_type === 'application/pdf';
  const needsPreview = !isImage && !isPdf;

  const [preview, setPreview] = useState<{ type: 'text' | 'html'; content: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [loading, setLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Fetch PDF/image as blob (iframe/img can't send auth cookies)
  useEffect(() => {
    if (!isPdf && !isImage) return;
    fetch(viewUrl, { credentials: 'include' })
      .then((res) => res.blob())
      .then((blob) => setBlobUrl(URL.createObjectURL(blob)))
      .catch(() => setPreviewError('Failed to load file'));
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewUrl, isPdf, isImage]);

  // Fetch preview for non-PDF/non-image files
  useEffect(() => {
    if (!needsPreview) return;
    setLoading(true);
    getFilePreview(conversationId, file.id)
      .then((data) => setPreview(data))
      .catch((err) => setPreviewError(err.message ?? 'Preview unavailable'))
      .finally(() => setLoading(false));
  }, [conversationId, file.id, needsPreview]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] mx-4 bg-white dark:bg-gray-900 rounded-2xl
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
          {/* Images */}
          {isImage && blobUrl && (
            <div className="flex items-center justify-center p-4">
              <img
                src={blobUrl}
                alt={file.display_name}
                className="max-w-full max-h-[75vh] object-contain rounded-lg"
              />
            </div>
          )}

          {/* PDF */}
          {isPdf && blobUrl && (
            <iframe
              src={blobUrl}
              title={file.display_name}
              className="w-full h-[80vh]"
            />
          )}

          {/* Loading blob */}
          {(isPdf || isImage) && !blobUrl && !previewError && (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading…
            </div>
          )}

          {/* Text/DOCX/Other — fetched preview */}
          {needsPreview && loading && (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading preview…
            </div>
          )}

          {needsPreview && !loading && preview?.type === 'html' && (
            <div
              className="p-6 prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: preview.content }}
            />
          )}

          {needsPreview && !loading && preview?.type === 'text' && (
            <pre className="p-6 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
              {preview.content}
            </pre>
          )}

          {needsPreview && !loading && !preview && previewError && (
            <div className="text-center py-16 text-gray-400">
              <p className="mb-3 text-sm">{previewError}</p>
              <a
                href={downloadUrl}
                download={file.original_name}
                className="text-minai-600 hover:underline text-sm"
              >
                Download original file
              </a>
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
