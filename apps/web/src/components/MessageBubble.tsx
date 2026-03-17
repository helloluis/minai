'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Message } from '@minai/shared';
import { decorateHtml } from '@/lib/decorator';
import { MessageActions } from './MessageActions';
import { FlashIcon, BalancedIcon, DeepIcon } from './ModeIcons';
import { WidgetRenderer } from './WidgetRenderer';

interface MessageBubbleProps {
  message: Message;
  prevMessage?: Message;
  previousUserMessage?: Message;
  onDelete?: (id: string) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${min}:${ss}`;
}

function formatDuration(startIso: string, endIso: string): string | null {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms <= 500 || isNaN(ms)) return null;
  const secs = Math.round(ms / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none z-10"
      >
        ×
      </button>
      <img
        src={src}
        alt="Full size"
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg
          touch-pinch-zoom select-none"
        draggable={false}
      />
    </div>
  );
}

/**
 * Markdown-to-HTML renderer.
 * Handles: bold, italic, inline code, code blocks, links, lists, tables, blockquotes, headers.
 */
function renderMarkdown(text: string): string {
  // 1. Extract code blocks first (protect from further processing)
  const codeBlocks: string[] = [];
  let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `\x00CODEBLOCK${idx}\x00`;
  });

  // 2. Extract tables
  const tableBlocks: string[] = [];
  html = html.replace(/(?:^|\n)(\|.+\|)\n(\|[-:\s|]+\|)\n((?:\|.+\|\n?)+)/g, (_match, header, _sep, body) => {
    const headerCells = parseCells(header);
    const bodyRows = body.trim().split('\n').map(parseCells);
    const thead = `<tr>${headerCells.map((c: string) => `<th>${inlineMarkdown(c)}</th>`).join('')}</tr>`;
    const tbody = bodyRows.map((row: string[]) => `<tr>${row.map((c: string) => `<td>${inlineMarkdown(c)}</td>`).join('')}</tr>`).join('');
    const idx = tableBlocks.length;
    tableBlocks.push(`<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`);
    return `\n\x00TABLE${idx}\x00\n`;
  });

  // 3. Process line by line
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  let listType = '';

  for (const line of lines) {
    // Restore code blocks
    if (line.includes('\x00CODEBLOCK')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      const idx = parseInt(line.match(/\x00CODEBLOCK(\d+)\x00/)?.[1] ?? '0');
      result.push(codeBlocks[idx]);
      continue;
    }

    // Restore tables
    if (line.includes('\x00TABLE')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      const idx = parseInt(line.match(/\x00TABLE(\d+)\x00/)?.[1] ?? '0');
      result.push(tableBlocks[idx]);
      continue;
    }

    // Unordered list
    if (/^[\s]*[-*]\s/.test(line)) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${inlineMarkdown(line.replace(/^[\s]*[-*]\s/, ''))}</li>`);
      continue;
    }

    // Ordered list
    if (/^[\s]*\d+\.\s/.test(line)) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${inlineMarkdown(line.replace(/^[\s]*\d+\.\s/, ''))}</li>`);
      continue;
    }

    if (inList) {
      result.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }

    // Headers
    if (line.startsWith('### ')) { result.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## ')) { result.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# ')) { result.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`); continue; }

    // Blockquote
    if (line.startsWith('> ')) { result.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`); continue; }

    // Empty line
    if (!line.trim()) { result.push(''); continue; }

    // Regular paragraph
    result.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');

  return result.join('\n');
}

function inlineMarkdown(text: string): string {
  // 1. Extract inline code spans first (protect from further processing)
  const codeSpans: string[] = [];
  let html = text.replace(/`([^`]+)`/g, (_match, code) => {
    const idx = codeSpans.length;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00CODE${idx}\x00`;
  });

  // 2. Extract markdown links [text](url) before escaping
  const links: string[] = [];
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, linkText, url) => {
    const idx = links.length;
    links.push(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(linkText)}</a>`);
    return `\x00LINK${idx}\x00`;
  });

  // 3. Now escape the remaining text
  html = escapeHtml(html);

  // 4. Bold & italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 5. Auto-link bare URLs (only in the escaped text, not inside placeholders)
  html = html.replace(
    /https?:\/\/[^\s<&\x00]+/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`
  );

  // 6. Restore inline code and links
  html = html.replace(/\x00CODE(\d+)\x00/g, (_match, idx) => codeSpans[parseInt(idx)]);
  html = html.replace(/\x00LINK(\d+)\x00/g, (_match, idx) => links[parseInt(idx)]);

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseCells(row: string): string[] {
  return row.split('|').slice(1, -1).map((c: string) => c.trim());
}

export function MessageBubble({ message, prevMessage, previousUserMessage, onDelete }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const duration = !isUser && prevMessage?.created_at
    ? formatDuration(prevMessage.created_at, message.created_at)
    : null;
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const closeLightbox = useCallback(() => setLightboxSrc(null), []);

  // Widget messages render as a plain bubble with no actions or metadata
  if (message.widget_data) {
    return (
      <div id={`message-${message.id}`} className="flex justify-start mb-3">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-sm">
          <WidgetRenderer data={message.widget_data} />
        </div>
      </div>
    );
  }

  return (
    <>
    {lightboxSrc && <Lightbox src={lightboxSrc} onClose={closeLightbox} />}
    <div
      id={`message-${message.id}`}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 group transition-colors duration-500`}
    >
      {/* Message actions for assistant messages - positioned outside bubble */}
      {!isUser && (
        <div className="flex-shrink-0 mr-1 self-start mt-1">
          <MessageActions message={message} previousUserMessage={previousUserMessage} />
        </div>
      )}

      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
          ${isUser
            ? 'bg-minai-600 text-white rounded-br-md message-bubble-user'
            : 'bg-gray-100 dark:bg-gray-800 rounded-bl-md'
          }`}
      >
        {/* Model badge removed — icon now in footer */}

        {/* Attached images */}
        {message.images && message.images.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2">
            {message.images.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Attachment ${i + 1}`}
                onClick={() => setLightboxSrc(src)}
                className="max-w-[200px] max-h-[200px] rounded-lg object-cover cursor-zoom-in"
              />
            ))}
          </div>
        )}

        {/* Message content */}
        <div
          className="message-content"
          dangerouslySetInnerHTML={{ __html: decorateHtml(renderMarkdown(message.content)) }}
        />

        {/* User message timestamp */}
        {isUser && message.created_at && (
          <div className="text-[10px] text-white/50 mt-1.5">
            {formatTime(message.created_at)}
          </div>
        )}

        {/* Assistant: model icon, tokens, cost, time, duration */}
        {!isUser && (message.output_tokens > 0 || message.created_at) && (
          <div className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-2">
            {message.model && (
              <span className="flex items-center gap-0.5" title={message.model === 'qwen3.5-flash' ? 'Fast mode' : 'Deep mode'}>
                {message.model === 'qwen3.5-flash' ? <FlashIcon /> : <DeepIcon />}
                <span>{message.model === 'qwen3.5-flash' ? 'Fast' : 'Deep'}</span>
              </span>
            )}
            {message.output_tokens > 0 && (
              <span title={`${message.input_tokens} in · ${message.output_tokens} out`}>
                {message.input_tokens + message.output_tokens} tokens
              </span>
            )}
            {message.token_cost_usd > 0 && (
              <span>${Number(message.token_cost_usd).toFixed(4)}</span>
            )}
            {message.created_at && (
              <span>{formatTime(message.created_at)}</span>
            )}
            {duration && (
              <span>({duration})</span>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
